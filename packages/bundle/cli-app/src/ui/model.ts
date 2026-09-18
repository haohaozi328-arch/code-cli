/**
 * Shared terminal-UI types: the snapshot the Ink tree renders, the actions it
 * invokes on the view model, and the auxiliary state the view model and its
 * controllers exchange. Only types live here so both the renderer and the
 * logic modules can depend on them without an import cycle.
 * @module @dsh-external/dsh-cli-app/ui/model
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionSummary } from '../sessions.ts'

/** One rendered transcript row. */
export interface UiMessage {
  /** Stable identity: user → message id; assistant → attempt id (streaming) or `a:<seq>` (committed). */
  key: string
  role: 'user' | 'assistant' | 'tool'
  /** Visible assistant/user text. */
  text: string
  /** Assistant reasoning text (dim, rendered separately). */
  reasoning: string
  /** `streaming` rows are live paint; `done` rows are log-settled. */
  status: 'streaming' | 'done'
  /** Durable seq for committed assistant rows. */
  seq?: number
  /** `system` rows are injected context; the transcript hides them. */
  system?: boolean
  /** Tool name, e.g. `bash`, `str_replace_editor` (role === 'tool'). */
  toolName?: string
  /** Shortened JSON argument preview. */
  argsSummary?: string
  /** `running` while awaiting the result; `done`/`error` settled. */
  toolStatus?: 'running' | 'done' | 'error'
  /** Collapsed one-line result preview. */
  toolResult?: string
  /** Live tool-call preview while the model streams arguments. */
  toolPreview?: string
}

/** A tool approval question surfaced by the answerer bridge. */
export interface ApprovalPrompt {
  toolName: string
  reason?: string
}

/** Steps of the interactive `/connect` wizard. */
export type ConnectStep = 'provider-id' | 'api-key' | 'base-url' | 'api-format' | 'model-id'

/** Non-secret state of the `/connect` wizard; the API key stays in the controller closure. */
export interface ConnectWizardState {
  provider: string
  custom: boolean
  step: ConnectStep
}

/** One selectable row in a choice list. */
export interface ChoiceItem {
  label: string
  value: string
}

/** One row of the slash-command palette. */
export interface CommandHint {
  name: string
  hint: string
  arg?: string
}

/** The action confirming a choice list performs. */
export type ChoicePickerKind = 'model' | 'policy' | 'connect-provider' | 'connect-api'

/** An open choice list (`/model`, `/perm`, `/connect`). */
export interface ChoicePickerState {
  kind: ChoicePickerKind
  /** Heading the modal renders. */
  title: string
  items: ChoiceItem[]
}

/** Context-window occupancy rendered by the composer's context ring. */
export interface ContextOccupancy {
  /** Occupancy of the newest known window, clamped to 0–100. */
  percent: number
  /** Tokens the next request's prompt would carry. */
  usedTokens: number
  /** Newest recorded route capacity. */
  contextWindow: number
}

/** Whole-screen snapshot handed to React through useSyncExternalStore. */
export interface UiState {
  messages: UiMessage[]
  running: boolean
  error: string | null
  modelLabel: string
  permissionPreset: string
  sessionId: SessionId
  /** Status-bar label for the current session (title/id + workspace tail). */
  sessionLabel: string
  /** Whether the resume picker is showing. */
  pickerOpen: boolean
  /** The persisted-session catalog the picker renders. */
  pickerItems: SessionSummary[]
  /** The live tool-approval question awaiting a key, or null. */
  pendingApproval: ApprovalPrompt | null
  /** Cumulative token usage for this session, for the status bar. */
  tokens: { input: number; output: number; reasoning: number }
  /** Generation throughput of the last observed window, in tokens per second. */
  tokenRate: number | null
  /** Context-window occupancy for the status ring, or null until a window is known. */
  contextOccupancy: ContextOccupancy | null
  /** An open model/policy/connect choice list, or null. */
  choicePicker: ChoicePickerState | null
  /** Current `/connect` wizard, excluding the secret API key. */
  connectWizard: ConnectWizardState | null
  /** Incremented by `/clear`; the transcript view rebuilds from this counter. */
  transcriptEpoch: number
}

/** What the user asked the host to do with the current session. */
export type ExitRequest =
  | { readonly type: 'quit' }
  | { readonly type: 'new' }
  | { readonly type: 'fork' }
  | { readonly type: 'switch'; readonly sessionId: string }
  | { readonly type: 'model-switch'; readonly spec: string }

/**
 * In-process approval bridge: the agent-scope answerer calls {@link
 * ApprovalBus.request} (which suspends until the UI answers), the UI observes
 * the prompt and calls {@link ApprovalBus.answer}.
 */
export interface ApprovalBus {
  /** Subscribe to prompt changes; invoked with the prompt or `null` when cleared. */
  onPrompt(callback: (prompt: ApprovalPrompt | null) => void): () => void
  /** Ask the UI to approve a tool; resolves with the chosen outcome. */
  request(prompt: ApprovalPrompt): Promise<'allowed-once' | 'rejected' | 'cancelled'>
  /** Answer the pending question (no-op when nothing is pending). */
  answer(outcome: 'allowed-once' | 'rejected' | 'cancelled'): void
}

/** Everything the terminal glue hands {@link createViewModel}. */
export interface ViewModelOptions {
  ctx: Context
  agent: Agent
  session: Session
  /** Status-bar label for this session (resolved by the host from the catalog). */
  sessionLabel: string
  /** Persisted-session rows for the resume picker. */
  catalog: SessionSummary[]
  /** Approval bridge shared with the agent-scope answerer. */
  approvalBus: ApprovalBus
  /** Optional flusher called after each settled turn (headless-style durability). */
  flush?: (session: Session) => Promise<void>
  /** Clear the visible viewport for `/clear`; owned by the Ink glue. */
  requestScreenClear?: () => void
}

/** The renderer-facing view model for one live agent. */
export interface ViewModel {
  /** Subscribe to snapshot changes; returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /** Latest snapshot; reference-stable between changes (useSyncExternalStore contract). */
  getState: () => UiState
  /** Queue a user turn and wake the driver; registry-command dispatch settles asynchronously. */
  send: (text: string) => void
  /** Cancel the running turn (user cause). */
  stop: () => void
  /** Leave the app entirely. */
  quit: () => void
  /** Open the session picker. */
  openPicker: () => void
  /** Close the session picker without acting. */
  closePicker: () => void
  /** Pick a catalog row and switch to it (resolves done with `switch`). */
  requestSwitch: (sessionId: string) => void
  /** Open the model choice picker (async model catalog from ctx.llm). */
  openModelPicker: () => void
  /** Confirm a model choice (resolves done with `model-switch`). */
  pickModel: (spec: string) => void
  /** Open the permission-preset choice picker. */
  openPolicyPicker: () => void
  /** Confirm a permission preset and apply both sandbox + approval controls. */
  pickPolicy: (policy: string) => void
  /** Open the provider `/connect` picker. */
  openConnectPicker: () => void
  /** Confirm a provider from the `/connect` picker. */
  pickConnectProvider: (provider: string) => void
  /** Submit the current text field in the `/connect` wizard. */
  submitConnectInput: (value: string) => void
  /** Confirm a custom-provider API format. */
  pickConnectApi: (api: string) => void
  /** Cancel the `/connect` wizard. */
  cancelConnect: () => void
  /** Close the model/policy/connect choice picker without acting. */
  closeChoicePicker: () => void
  /** Answer the pending approval question. */
  resolveApproval: (outcome: 'allowed-once' | 'rejected' | 'cancelled') => void
  /** Resolves when the UI asked for a session lifecycle change. */
  done: Promise<ExitRequest>
  /** Detach every listener. */
  dispose: () => void
}
