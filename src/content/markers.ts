/**
 * The one definition of the markers the product writes into someone else's page.
 *
 * Renderer writes them, restorer removes them, observer ignores them, and the segmenter must never
 * read a target subtree as source text (contracts/page-markup-ownership.md §2). No module may repeat
 * these literals.
 */

/** A rendered translation container. Product output — never source text. */
export const TARGET_MARKER = "target";

/** A page block that owns a translation. The block itself is still page text. */
export const SOURCE_MARKER = "source";

/**
 * A passage's translation is on its way: the slot the translation will occupy, before it holds text.
 * It becomes a target container in place, so it is product output in every sense — never source
 * text, never announced, and removed by the same journal replay as a translation.
 */
export const PENDING_MARKER = "pending";

/** The attribute both markers live on, used by the observer and the restore residue audit. */
export const MARKER_ATTRIBUTE = "data-ipt";
