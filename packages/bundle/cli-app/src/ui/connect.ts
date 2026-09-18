/**
 * `/connect` wizard: connects a model provider by persisting its route through
 * the existing settings namespace and its secret through the credentials
 * service. The API key never enters the UI snapshot; the controller holds it
 * only until the provider is saved or the wizard is cancelled.
 * @module @dsh-external/dsh-cli-app/ui/connect
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { COPY } from './copy.ts'
import type { ChoiceItem, ChoicePickerState, ConnectWizardState } from './model.ts'
import { renderError } from './render-error.ts'

/** API protocols a custom provider may speak. */
export const CONNECT_API_OPTIONS: readonly ChoiceItem[] = [
  { label: 'OpenAI Chat Completions', value: 'openai-completions' },
  { label: 'OpenAI Responses', value: 'openai-responses' },
  { label: 'Anthropic Messages', value: 'anthropic-messages' },
]

/** Provider-picker value that starts the custom-provider flow. */
export const CUSTOM_PROVIDER = '__custom__'

/** Stable credential reference for a connected provider; the secret itself never enters settings. */
function connectCredentialRef(provider: string): ReturnType<typeof credentialRef> {
  const safe = provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return credentialRef(`DSH_${safe || 'CUSTOM'}_API_KEY`)
}

/** Persist one connected provider through the settings + credential seams. */
async function persistConnectedProvider(
  ctx: Context,
  provider: string,
  apiKey: string,
  baseURL: string,
  api: string | undefined,
  modelId: string | undefined,
): Promise<void> {
  const settings = ctx.get('settings')
  const credentials = ctx.get('credentials')
  if (settings === undefined) throw new Error('connect: settings service is unavailable')
  if (credentials === undefined) throw new Error('connect: credentials service is unavailable')
  const ref = connectCredentialRef(provider)
  const profile: Record<string, unknown> = { apiKeyEnv: String(ref) }
  if (baseURL !== '') profile.baseURL = baseURL
  if (api !== undefined) profile.api = api
  if (modelId !== undefined) {
    profile.models = [{
      id: modelId,
      name: modelId,
      contextWindow: 262_144,
      maxTokens: 32_768,
      input: ['text'],
    }]
  }
  await settings.update('llm-pi-ai', { providers: { [provider]: profile } })
  await credentials.set(ref, apiKey)
}

/** Callbacks the view model supplies so the wizard can drive the UI. */
export interface ConnectHost {
  /** Surface a validation or persistence failure. */
  fail(message: string): void
  /** Append a transcript notice after a provider is saved. */
  notice(text: string): void
  /** Show a choice list (the provider catalog or the API-format list). */
  showChoice(picker: ChoicePickerState): void
  /** Dismiss any open choice list. */
  closeChoice(): void
  /** Publish a wizard-state change to the renderer. */
  changed(): void
}

/** Drives the `/connect` wizard for one live session. */
export class ConnectController {
  private readonly ctx: Context
  private readonly host: ConnectHost
  private wizard: ConnectWizardState | null = null
  private apiKey = ''
  private baseURL = ''
  private api = ''

  /**
   * @param ctx - process context carrying the settings and credentials services.
   * @param host - renderer callbacks.
   */
  constructor(ctx: Context, host: ConnectHost) {
    this.ctx = ctx
    this.host = host
  }

  /** Current wizard step, or null when no wizard is open. */
  get state(): ConnectWizardState | null {
    return this.wizard
  }

  /** Offer the configured providers plus a custom-entry row. */
  openPicker(): void {
    const providers = this.ctx.get('llm')?.listConfigurableProviders() ?? []
    const items: ChoiceItem[] = providers
      .map(provider => ({ label: `${provider.displayName} (${provider.provider})`, value: provider.provider }))
      .sort((left, right) => left.label.localeCompare(right.label))
    items.push({ label: COPY.customProvider, value: CUSTOM_PROVIDER })
    this.host.showChoice({ kind: 'connect-provider', title: COPY.choiceTitleConnectProvider, items })
  }

  /**
   * Begin the wizard for one provider id (or the custom-provider row).
   * @param provider - the chosen provider id, or {@link CUSTOM_PROVIDER}.
   */
  start(provider: string): void {
    const custom = provider === CUSTOM_PROVIDER
    this.forgetSecrets()
    this.wizard = { provider: custom ? '' : provider, custom, step: custom ? 'provider-id' : 'api-key' }
    this.host.closeChoice()
    this.host.changed()
  }

  /**
   * Feed the current text field to the wizard.
   * @param value - the raw text-field contents.
   */
  submit(value: string): void {
    const state = this.wizard
    if (state === null) return
    const text = value.trim()
    switch (state.step) {
      case 'provider-id':
        if (!/^[a-z][a-z0-9-]*$/.test(text)) {
          this.host.fail('connect: provider ID must match [a-z][a-z0-9-]*')
          return
        }
        this.wizard = { ...state, provider: text, step: 'api-key' }
        this.host.changed()
        return
      case 'api-key':
        if (text === '') {
          this.host.fail('connect: API key cannot be empty')
          return
        }
        this.apiKey = text
        this.wizard = { ...state, step: 'base-url' }
        this.host.changed()
        return
      case 'base-url':
        this.baseURL = text
        if (state.custom) {
          this.wizard = { ...state, step: 'api-format' }
          this.host.showChoice({ kind: 'connect-api', title: COPY.choiceTitleConnectApi, items: [...CONNECT_API_OPTIONS] })
        } else {
          void this.finish()
        }
        return
      case 'model-id':
        if (text === '') {
          this.host.fail('connect: model ID cannot be empty')
          return
        }
        void this.finish(text)
        return
      case 'api-format':
        // The API format arrives through pickApi; the text field is inert here.
        return
    }
  }

  /**
   * Confirm the custom provider's API format.
   * @param api - the chosen protocol value.
   * @returns whether the value was accepted.
   */
  pickApi(api: string): boolean {
    const state = this.wizard
    if (state === null || state.step !== 'api-format') return false
    if (!CONNECT_API_OPTIONS.some(option => option.value === api)) {
      this.host.fail(`connect: unsupported API format ${api}`)
      return false
    }
    this.api = api
    this.wizard = { ...state, step: 'model-id' }
    this.host.closeChoice()
    this.host.changed()
    return true
  }

  /** Abandon the wizard and forget the secret. */
  cancel(): void {
    this.wizard = null
    this.forgetSecrets()
    this.host.closeChoice()
    this.host.changed()
  }

  /** Forget the in-flight secret when the session ends. */
  dispose(): void {
    this.wizard = null
    this.forgetSecrets()
  }

  /** Save the provider, then publish success or failure. */
  private async finish(modelId?: string): Promise<void> {
    const state = this.wizard
    if (state === null) return
    if (this.apiKey.trim() === '') {
      this.host.fail('connect: API key cannot be empty')
      return
    }
    try {
      await persistConnectedProvider(
        this.ctx,
        state.provider,
        this.apiKey.trim(),
        this.baseURL.trim(),
        state.custom ? this.api : undefined,
        state.custom ? modelId?.trim() : undefined,
      )
      this.wizard = null
      this.forgetSecrets()
      this.host.notice(COPY.connectDone.replaceAll('{provider}', state.provider))
    } catch (failure: unknown) {
      this.host.fail(renderError(failure))
    }
    this.host.changed()
  }

  /** Drop the collected secret material. */
  private forgetSecrets(): void {
    this.apiKey = ''
    this.baseURL = ''
    this.api = ''
  }
}
