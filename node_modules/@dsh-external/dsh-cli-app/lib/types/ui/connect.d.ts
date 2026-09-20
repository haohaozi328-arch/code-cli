/**
 * `/connect` wizard: connects a model provider by persisting its route through
 * the existing settings namespace and its secret through the credentials
 * service. The API key never enters the UI snapshot; the controller holds it
 * only until the provider is saved or the wizard is cancelled.
 * @module @dsh-external/dsh-cli-app/ui/connect
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ChoiceItem, ChoicePickerState, ConnectWizardState } from './model.ts';
/** API protocols a custom provider may speak. */
export declare const CONNECT_API_OPTIONS: readonly ChoiceItem[];
/** Provider-picker value that starts the custom-provider flow. */
export declare const CUSTOM_PROVIDER = "__custom__";
/** Callbacks the view model supplies so the wizard can drive the UI. */
export interface ConnectHost {
    /** Surface a validation or persistence failure. */
    fail(message: string): void;
    /** Append a transcript notice after a provider is saved. */
    notice(text: string): void;
    /** Show a choice list (the provider catalog or the API-format list). */
    showChoice(picker: ChoicePickerState): void;
    /** Dismiss any open choice list. */
    closeChoice(): void;
    /** Publish a wizard-state change to the renderer. */
    changed(): void;
}
/** Drives the `/connect` wizard for one live session. */
export declare class ConnectController {
    private readonly ctx;
    private readonly host;
    private wizard;
    private apiKey;
    private baseURL;
    private api;
    /**
     * @param ctx - process context carrying the settings and credentials services.
     * @param host - renderer callbacks.
     */
    constructor(ctx: Context, host: ConnectHost);
    /** Current wizard step, or null when no wizard is open. */
    get state(): ConnectWizardState | null;
    /** Offer the configured providers plus a custom-entry row. */
    openPicker(): void;
    /**
     * Begin the wizard for one provider id (or the custom-provider row).
     * @param provider - the chosen provider id, or {@link CUSTOM_PROVIDER}.
     */
    start(provider: string): void;
    /**
     * Feed the current text field to the wizard.
     * @param value - the raw text-field contents.
     */
    submit(value: string): void;
    /**
     * Confirm the custom provider's API format.
     * @param api - the chosen protocol value.
     * @returns whether the value was accepted.
     */
    pickApi(api: string): boolean;
    /** Abandon the wizard and forget the secret. */
    cancel(): void;
    /** Forget the in-flight secret when the session ends. */
    dispose(): void;
    /** Save the provider, then publish success or failure. */
    private finish;
    /** Drop the collected secret material. */
    private forgetSecrets;
}
//# sourceMappingURL=connect.d.ts.map