# Reference page fixtures

**Status**: authored for this repository. Not captured from live sites.

`plan.md` asks for twenty public pages across news, documentation, forum, wiki and blog forms,
frozen for the release. Downloading live pages verbatim is not reproducible: the pages change,
carry third-party scripts, and would make SC-003, SC-004 and SC-011 depend on someone else's
deploy schedule. These fixtures are therefore **authored**, each shaped like one of those page
forms, and each chosen to exercise a condition the specification names. They are labelled as
fixtures everywhere so they are never presented as evidence that real pages work
(constitution principle III: fixture data is not evidence of a real flow).

Replacing them with captures of real public pages is a release step that requires recording the
URL, the capture date and the reason for the substitution in this file.

| File | Form | Why it is in the set |
|---|---|---|
| news-article-a.html | News article | Long prose, a quote, a list, a byline; the ordinary case |
| news-article-b.html | News article | Figure and caption; an image beside translatable prose |
| news-live.html | Live ticker | Content injected 700 ms after load and on demand (edge case: late content) |
| docs-guide.html | Documentation | Ordered steps, code block, table, inline code (FR-009) |
| docs-api.html | Documentation | Definition list and a JSON example; short segments |
| forum-thread.html | Forum thread | Quoted replies and a reply form with a textarea (FR-007) |
| wiki-entry.html | Wiki entry | Contents sidebar, reference list, nested lists |
| blog-post.html | Blog post | Sectioned long-form prose with a pull quote |
| blog-short.html | Blog post | Three paragraphs; the smallest useful page |
| article-long.html | Long article | 120 paragraphs: larger than one request (FR-010, US4 scenario 3) |
| article-privacy.html | Article | Carries `ZZPRIVACYZZ` for the egress assertions (SC-005) |
| docs-rtl.html | Documentation | Arabic, right-to-left, RTL layout (edge case) |
| docs-ja.html | Documentation | Japanese source, no spaces between words |
| news-zh.html | News article | Chinese source; same-language target (edge case: no-op translation) |
| forum-nested.html | Forum draft | contenteditable, input, password, textarea, select, hidden and aria-hidden blocks (FR-007, FR-014) |
| wiki-optout.html | Wiki notice | `translate="no"` and `.notranslate` blocks (FR-014) |
| blog-code.html | Blog post | Code blocks and inline code that must stay copyable (FR-009, SC-009) |
| news-long-words.html | News article | Unbreakable URL and identifier: horizontal-scroll guard (SC-004) |
| docs-table.html | Documentation | Table-heavy page: cells are translation units |
| article-hidden.html | Article | Hidden and `hidden`-attribute blocks mixed with visible prose |
| article-abstract.html | Article | Authored: a ~900-character abstract and two long body paragraphs; split-block completeness (SC-001, SC-004, SC-007) |
| article-tests-as-data.html | Article | Captured front matter of the reported page; SC-001 regression (see below) |

### Captured page: article-tests-as-data.html

- **URL**: https://martinfowler.com/articles/tests-as-data.html
- **Captured**: 2026-11-14
- **Reason**: the reported defect ("正文摘要没有全部翻译") and the acceptance case for SC-001. The
  abstract is 999 characters and is translated in four parts.
- **Scope of the capture**: article front matter (title, subtitle, abstract, date, author, tags,
  contents) plus the Introduction heading and its first two paragraphs. Third-party scripts and site
  chrome are removed; the captured text is not edited. Everything outside that region is absent, so
  this fixture is evidence for the abstract only, not for the whole page.

All pages are served over real HTTP by `tests/support/stub-provider.ts` under `/pages/`, so the
extension meets them exactly as it meets a web page — no `file://` privileges required.
