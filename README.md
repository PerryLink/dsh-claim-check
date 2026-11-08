# dsh-claim-check

**Does the source actually support the claim as written?**

*Byte-level, deterministic, recomputable: verbatim spans, numbers, labelled values, negation and hedging. A paraphrase is reported as `insufficient` — never as "supported".*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

English · [简体中文](README-zh.md)

---

## What it does

- **Verbatim span check** — every quoted span in the claim must occur in the source (whitespace/Unicode normalized).
- **Number check** — every numeric literal in the claim must occur in the source, with formatting tolerance (`2.50` = `2.5`).
- **Labelled-value check** — when the claim says `d = 0.80` and the source says `d = 0.45`, the claim is `disproven` with both values shown. This is what turns "a number is missing" into a real contradiction.
- **Polarity check** — an affirmative claim built on a fragment of a negated sentence ("**not** significant") is `contradicted`.
- **Strength check** — a hedged/associational sentence ("may be associated", "preliminary") sold as causal ("proves", "demonstrates") is `contradicted`.
- **REP integration** — source snapshot + claim + verdict + checks become a valid record; `claim_bind` checks against evidence already stored by `doc_anchor` / `cite_verify`.

## What it does not do

- **No semantics.** A paraphrase with no verbatim span is `insufficient`, not "supported". This is a deliberate limit, not a bug.
- **No data re-analysis.** It does not check whether the underlying statistic is right — that is `dsh-statcheck`.
- **No PDF reading.** Extract text first (`dsh-doc-anchor`).
- **No misconduct claims.** A verdict is about the text, never about the authors.
- **No model call.** Every finding is recomputable from the two strings.

## Verdict semantics

| Verdict | Meaning |
|---|---|
| `verified` | a verbatim span was located **and** the numbers agree (and no polarity/strength contradiction) |
| `disproven` | the quoted span is absent, or a labelled value contradicts the source |
| `contradicted` | the cited sentence's negation or hedging was flipped |
| `insufficient` | no verbatim span (paraphrase), or a number is missing, or the source says nothing |
| `unverified` | reserved by REP v1 for a claim with no checkable content; v0.1 reports such a paraphrase as `insufficient` |

`insufficient` never means false, and never means "clean".

## Tools

### `claim_check`

`{ claim, text? | path?, quote?, persist? }` → `{ ok, verdict, checks[], quotes[], labels[], evidenceId?, claimId?, recordPath? }`.

### `claim_bind`

`{ claim, evidenceId, quote?, persist? }` — reads the evidence's textual snapshot from the REP store and writes the claim + verdict there.

### `claim_report`

`{ claim, verdict, checks }` → `{ ok, markdown, sarif }`. Failed/warning checks become SARIF results.

### Error codes

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `EVIDENCE_UNKNOWN` · `STORE_ERROR`

## Compatibility & install

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`** (verified 2026-11-08); peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0` (tested `24.22.1`), ESM only |
| Peers | `@perrylink/dsh-research-core ^0.1.0`, `@deepseek-ai/cordis ^4.0.5-alpha.1`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| Runtime dependencies | **zero** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core @perrylink/dsh-claim-check
dsh --profile <name> --dump-config | grep @perrylink/dsh-claim-check
```

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` mounts nothing |
| `root` | `.claim-check` | store + records root |
| `workspaceRoot` | `process.cwd()` | source paths must resolve inside it |
| `maxChars` | `2000000` | source-character cap (fails, never truncates) |
| `persist` | `true` | store evidence + claim + record |

## Evaluation

### Regression baseline — `dsh-research-bench` claims v0.1.0 (50 cases)

```sh
pnpm run bench:claims
```

| metric | value |
|---|---:|
| verdict accuracy | **1.00** |
| verified precision / recall | **1.00 / 1.00** |
| insufficient precision / recall | **1.00 / 1.00** |
| contradicted precision / recall | **1.00 / 1.00** |
| disproven precision / recall | **1.00 / 1.00** |
| over-claim rate (unsupported called verified) | **0.00** |
| false-alarm rate on supported claims | **0.00** |

Raw per-case predictions: [`bench/results-claims.json`](bench/results-claims.json).

**Validity caveat (read this before quoting the numbers).** The 50 cases and the
detector rules were written together from the same rubric, and the polarity rule
was narrowed after one supported case failed during development. These numbers
are a **regression baseline, not an unbiased estimate** of real-manuscript
accuracy. The held-out set below is the next step; it is a same-author temporal
hold-out, not a fully blind external audit.

### Held-out set — `dsh-research-bench` claims-heldout v0.1.0 (50 cases, frozen 2026-11-08)

```sh
pnpm run bench:claims-holdout
```

The 50 cases live in the sibling `dsh-research-bench` working tree at
`data/claims-heldout/` (seven synthetic sources, four sentences each) and were
frozen before the first evaluation run. `SUMMARY.json` records
`heldOut: true`, `frozenAt: "2026-11-08"` and
`sha256:016eaa67ba12ec1b3022e68dbc627b414c43733551fdd457b70dd1907e81d470`.
The runner re-hashes `cases.jsonl` on every run and refuses to score if the
frozen hash no longer matches; no label was changed after the freeze.

| metric | regression baseline | held-out |
|---|---:|---:|
| verdict accuracy | 1.00 | **0.96** (48/50) |
| verified precision / recall | 1.00 / 1.00 | **0.88 / 1.00** |
| insufficient precision / recall | 1.00 / 1.00 | **1.00 / 1.00** |
| contradicted precision / recall | 1.00 / 1.00 | **1.00 / 0.83** |
| disproven precision / recall | 1.00 / 1.00 | **1.00 / 1.00** |
| over-claim rate (unsupported called verified) | 0.00 | **0.06** (2/35) |
| false-alarm rate on supported claims | 0.00 | **0.00** |

Per-category accuracy: supported 15/15, paraphrase 10/10, number-wrong 8/8,
negated 6/7, quote-mined 4/5, insufficient 5/5.

Raw per-case predictions: [`bench/results-claims-holdout.json`](bench/results-claims-holdout.json);
markdown: [`bench/results-claims-holdout.md`](bench/results-claims-holdout.md).

**The two misses are over-claims, and both are cue-list coverage gaps.** Quote
location, number matching and labelled-value contradiction were perfect on this
set; the errors are semantic cues the lexical lists do not know:

1. `claim-0034` (negated; expected `contradicted`, predicted `verified`). The
   source says "The coating failed to improve rate capability..." and the claim
   quotes only "improve rate capability at 4.2 V". "Failed to" is a semantic
   negation, but the v0.1 negation cues are `not` / `no` / `never` / ... and do
   not include it, so the polarity check never runs. Candidate fix: add
   `fail(?:ed|s)? to`, `unable to` and `declined to` to the cue list, with
   regression tests.
2. `claim-0045` (quote-mined; expected `contradicted`, predicted `verified`).
   The source says "Cooling seems tied to canopy density..." and the claim says
   that "proves" a causal effect. "Seems tied to" is associational/hedged, but
   the v0.1 hedge cues do not include it, so the strength check never runs.
   Candidate fix: add `seem(?:s|ed)?`, `appear(?:s|ed)?`, `tied to`, `linked
   to`, `tentative` and `exploratory` to the hedge cues, with tests.

These are exactly the cases a regression baseline cannot expose: the same author
wrote the baseline cases alongside the cue lists.

**Independence (honest).** The held-out set is **not a fully blind external
audit**. It was written by the same rubric author as the regression baseline,
from `rubric/CLAIMS.md`, and it follows the same construction conventions
(explicit double-quoted spans, one quoted span per claim, synthetic English
paragraphs). What is independent is the content: seven new topics, new
sentences, new numbers, and no source paragraph or claim reused from
`data/claims`; the labels were fixed and hashed before the first evaluation
run, and no label was changed afterwards. It is a temporal hold-out and a test
of cue-list coverage, not an unbiased estimate of real-manuscript accuracy: the
set is synthetic and small (5–15 cases per category). The dataset stays in the
sibling bench working tree for now; this repository commits the runner and the
frozen results, not the cases.

### Tests

**26 tests** across three files: evaluator (quote extraction incl. possessives, exact quote offsets when the first token repeats, sentence location, verified / paraphrase / absent quote / labelled-value contradiction / negation flip / hedged overclaim / null-result accuracy / interval quotes / missing number / absent content), runtime/tools (REP record validity, re-check without an evidence conflict, persist=false, path escape, bind to stored evidence and to its text snapshot rather than the first snapshot; schemas, renderers, failure branch, package contract), mount (the enabled/disabled mount contract).

## Known limitations (v0.1)

- Indirect quotation, citation markers and table lookups are not parsed.
- Hedging detection is lexical (a fixed cue list), so a causal claim that avoids those verbs may pass.
- A quoted *interval* or sample size does not carry direction, so polarity is only checked for directional fragments.
- Non-English claims are supported structurally but the cue lists are English-only.
- The held-out run found two concrete cue gaps: `failed to` (semantic negation) and `seems tied to` (hedge); both are tracked in the held-out section above.

## License

Apache-2.0. No third-party runtime code.
