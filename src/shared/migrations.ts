import type { Migration } from "./settings.js";
import { isDisplayStyleId } from "./display-styles.js";

/**
 * Ordered, pure, idempotent migrations (contracts/settings-and-messages.md section 2).
 * Nothing is persisted until every step succeeds; the store owns that atomically.
 */

export const MIGRATIONS: readonly Migration[] = [
  {
    to: 2,
    name: "add-display-style",
    apply(raw) {
      const next: Record<string, unknown> = { ...raw };

      const ui = raw["ui"];
      if (ui && typeof ui === "object" && !Array.isArray(ui)) {
        const record = ui as Record<string, unknown>;
        next["ui"] = {
          ...record,
          displayStyle: isDisplayStyleId(record["displayStyle"]) ? record["displayStyle"] : "none",
        };
      }

      if (Array.isArray(raw["sites"])) {
        next["sites"] = (raw["sites"] as unknown[]).map((site) => {
          if (!site || typeof site !== "object" || Array.isArray(site)) return site;
          const record = { ...(site as Record<string, unknown>) };
          if (!isDisplayStyleId(record["displayStyle"])) delete record["displayStyle"];
          return record;
        });
      }

      return next;
    },
  },
];
