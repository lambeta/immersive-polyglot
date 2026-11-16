#!/usr/bin/env node
/**
 * Generates the long-page fixtures for feature 007.
 *
 * They are generated rather than hand-written so that "200 passages" is a fact of the file, not a
 * claim, and so the passage token in each paragraph ("P012 —") lets an e2e test map what the
 * provider was asked for back to what the reader could see.
 *
 * Run: node scripts/make-long-fixture.mjs
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PASSAGES = 200;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tests", "fixtures", "pages");

const SENTENCES = [
  "The harbour records describe cargo moving inland by barge, and the toll books list every crossing in the same hand for eleven years.",
  "A ferry leaves the northern pier at seven, and the clerks who count its passengers keep a second ledger that the auditors never ask about.",
  "Lighthouse keepers wrote short entries in winter, long ones in summer, and the ink changes with the season more reliably than the weather does.",
  "The archive keeps three copies of every manifest, and the third copy is the one that disagrees with the other two.",
  "Salt air has eaten the corner of the map where the estuary meets the sea, so the last mile of the channel is now a rumour rather than a line.",
  "Someone has annotated the margins in pencil, mostly dates, occasionally a single word that reads like a complaint about the tide.",
  "The customs house was rebuilt twice, first after a fire and then after an argument about whose responsibility a fire is.",
  "Boats are named for daughters, saints and debts, and the register records all three with the same even handwriting.",
  "Every fifth page carries a stamp that no one has been able to date, though the paper around it has been dated twice.",
  "The river was dredged in the spring, which is why the depths written in this column disagree with every chart that came before it.",
];

function paragraph(index) {
  const text = SENTENCES[index % SENTENCES.length];
  const extra = SENTENCES[(index * 3 + 1) % SENTENCES.length];
  return `      <p class="passage">P${String(index + 1).padStart(3, "0")} — ${text} ${extra}</p>`;
}

function page({ noAnchor }) {
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Harbour archive — a long entry</title>",
    "    <style>",
    "      body { margin: 0 auto; max-width: 38rem; font: 16px/1.6 Georgia, serif; padding: 1rem 1.25rem 4rem; }",
    "      h1 { font-size: 1.6rem; margin: 0 0 1rem; }",
    "      p.passage { margin: 0 0 1.1rem; }",
    noAnchor ? "      html { overflow-anchor: none; }" : "",
    "    </style>",
    "  </head>",
    "  <body>",
    "    <article>",
    "      <h1>The harbour archive, read from the top</h1>",
    ...Array.from({ length: PASSAGES }, (_, index) => paragraph(index)),
    "    </article>",
    "  </body>",
    "</html>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
  return html;
}

await writeFile(join(outDir, "article-endless.html"), page({ noAnchor: false }), "utf8");
await writeFile(join(outDir, "article-endless-noanchor.html"), page({ noAnchor: true }), "utf8");
console.log(`wrote ${PASSAGES} passages to article-endless.html and article-endless-noanchor.html`);
