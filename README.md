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
| `unverified` | nothing checkable was supplied at all |

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
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-claim-check
dsh --profile <name> --dump-config | grep dsh-claim-check
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

### Benchmark — `dsh-research-bench` claims v0.1.0 (50 cases)

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
accuracy. The bench rubric records this; a held-out set authored without
reference to the implementation is the next step before any release claim.

### Tests

**21 tests** across two files: evaluator (quote extraction, sentence location, verified / paraphrase / absent quote / labelled-value contradiction / negation flip / hedged overclaim / null-result accuracy / interval quotes / missing number / absent content), runtime (REP record validity, persist=false, path escape, bind to stored evidence), tools (schemas, renderers, failure branch), package contract.

## Known limitations (v0.1)

- Indirect quotation, citation markers and table lookups are not parsed.
- Hedging detection is lexical (a fixed cue list), so a causal claim that avoids those verbs may pass.
- A quoted *interval* or sample size does not carry direction, so polarity is only checked for directional fragments.
- Non-English claims are supported structurally but the cue lists are English-only.

## License

Apache-2.0. No third-party runtime code.
