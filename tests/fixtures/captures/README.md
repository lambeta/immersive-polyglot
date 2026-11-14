# Reference capture corpus (SC-011)

**Status: outstanding.** This directory holds the frozen reference captures that make SC-011
decidable. It is empty of real captures today.

## What has to happen (task T010)

Install the reference product (Immersive Translate) in a desktop Chrome profile, open each page in
`../pages/` at viewport 1280×800, translate it in each display mode, and record:

```text
tests/fixtures/captures/<page-id>/<mode>.json
{
  "page": "news-article-a.html",
  "mode": "bilingual",
  "capturedWith": "Immersive Translate <version>, Chrome <version>, viewport 1280x800",
  "capturedAt": "YYYY-MM-DD",
  "segments": [
    {
      "sourceSelector": "article > p:nth-of-type(2)",
      "sourceText": "...",
      "translatedText": "...",
      "relation": "siblingAfter",
      "containerTag": "div",
      "inheritsTypography": true,
      "langAttribute": "zh-CN"
    }
  ],
  "restoreBaseline": { "domHash": "<hash before translation>", "scrollY": 0 }
}
```

The capture is manual and one-time because installing a store extension is interactive. Re-capturing
requires a recorded reason in this file: it silently redefines "correct".

## Why it is not bootstrapped here

Recording our own output and calling it the reference would be circular: the criterion would
compare the product to itself and always pass. The synthetic example below exercises the
comparison machinery; it is **not** evidence of the reference product's behaviour, its directory
name starts with `_`, and the default run skips it.

## Synthetic example

`_example-synthetic/` contains one hand-written capture for `news-article-a.html`. It exists so
`npm run verify:rendering -- --include-example` can prove the comparison, layout and restore checks
work before the real corpus exists.

Delete this directory once the real corpus is captured.

## Running

```bash
npm run verify:rendering                     # real corpus; exits 2 while it is missing
npm run verify:rendering -- --include-example  # synthetic example only
```
