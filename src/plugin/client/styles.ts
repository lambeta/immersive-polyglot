/** The Client half's own CSS: theme tokens only, so light and dark follow the shell. */

const MARKER = "data-immersive-polyglot-style";

export const STYLE = `
.ip-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.28));
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  font-size: var(--dsw-font-xs-13, 13px);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.ip-control:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, inherit);
}
.ip-control:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary, #4d6bfe);
  outline-offset: 1px;
}
.ip-control--on {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ip-control--busy {
  cursor: progress;
  opacity: 0.75;
}
.ip-control--error {
  border-color: var(--dsw-alias-state-error-primary, #d9534f);
  color: var(--dsw-alias-state-error-primary, #d9534f);
}
.ip-control:disabled {
  cursor: default;
  opacity: 0.5;
}
.ip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.ip-turn {
  margin-top: 10px;
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--dsw-alias-state-business-primary, #4d6bfe);
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: var(--dsw-font-xs-13, 13px);
  line-height: 1.7;
}
.ip-turn-label {
  margin-bottom: 2px;
  color: var(--dsw-alias-label-tertiary, inherit);
  font-size: var(--dsw-font-xs-13, 13px);
  letter-spacing: 0.02em;
}
.ip-turn-section {
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}
.ip-turn-section:last-child {
  margin-bottom: 0;
}
.ip-turn-text {
  margin: 0 0 6px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ip-turn-section > :last-child,
.ip-turn-text:last-child {
  margin-bottom: 0;
}
.ip-md-heading {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: var(--dsw-font-xs-13, 13px);
  font-weight: 600;
  line-height: 1.5;
}
.ip-md-list {
  margin: 0 0 6px;
  padding-left: 18px;
}
.ip-md-list li + li {
  margin-top: 2px;
}
.ip-md-code {
  padding: 1px 4px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-base, rgba(127, 127, 127, 0.14));
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.95em;
}
.ip-md-pre {
  margin: 0 0 6px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-base, rgba(127, 127, 127, 0.14));
  overflow-x: auto;
}
.ip-md-pre .ip-md-code {
  padding: 0;
  background: none;
}
.ip-md-quote {
  margin: 0 0 6px;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3));
  color: var(--dsw-alias-label-tertiary, inherit);
}
.ip-md-rule {
  margin: 6px 0;
  border: 0;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.28));
}
.ip-md-link {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ip-md-path {
  color: var(--dsw-alias-label-secondary, inherit);
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.ip-turn--pending {
  color: var(--dsw-alias-label-tertiary, inherit);
  font-style: italic;
}
`;

/**
 * Add the stylesheet once for the lifetime of the plugin.
 * @returns a disposer removing it.
 */
export function installStyle(): () => void {
  const element = document.createElement("style");
  element.setAttribute(MARKER, "");
  element.textContent = STYLE;
  document.head.append(element);
  return () => {
    element.remove();
  };
}
