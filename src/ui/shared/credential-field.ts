import { t } from "./i18n.js";

/**
 * The credential input of FR-021 and the disclosure gate of FR-023, shared by options and popup.
 * A stored secret is never written back into the input: the field shows only a mask as its
 * placeholder, so the value cannot be read off the screen or out of the DOM.
 */

export interface CredentialFieldOptions {
  input: HTMLInputElement;
  /** The disclosure checkbox that must be ticked before the field accepts input. */
  acknowledgement?: HTMLInputElement;
  onAcknowledgementChange?(): void;
}

export class CredentialField {
  readonly #input: HTMLInputElement;
  readonly #acknowledgement: HTMLInputElement | undefined;
  #storedMask: string | null = null;

  constructor(options: CredentialFieldOptions) {
    this.#input = options.input;
    this.#acknowledgement = options.acknowledgement;
    this.#input.type = "password";
    this.#input.autocomplete = "new-password";
    this.#input.spellcheck = false;
    this.#input.value = "";

    if (this.#acknowledgement) {
      this.#acknowledgement.addEventListener("change", () => {
        this.#syncEnabled();
        options.onAcknowledgementChange?.();
      });
    }
    this.#syncEnabled();
  }

  get enabled(): boolean {
    if (!this.#acknowledgement) return true;
    return this.#acknowledgement.checked;
  }

  get value(): string {
    return this.#input.value.trim();
  }

  setStoredMask(masked: string | null): void {
    this.#storedMask = masked;
    this.#input.value = "";
    this.#input.placeholder = masked ? `${t("providerCredentialKeep")} (${masked})` : t("providerCredential");
  }

  /** True when the user left a stored credential untouched instead of replacing it. */
  get keepingStored(): boolean {
    return this.#storedMask !== null && this.value.length === 0;
  }

  clear(): void {
    this.#input.value = "";
    this.#storedMask = null;
    this.#input.placeholder = t("providerCredential");
  }

  focus(): void {
    this.#input.focus();
  }

  #syncEnabled(): void {
    this.#input.disabled = !this.enabled;
    this.#input.setAttribute("aria-disabled", String(!this.enabled));
    if (!this.enabled) this.#input.value = "";
  }
}
