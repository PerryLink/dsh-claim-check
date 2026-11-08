# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Held-out claim-support benchmark: 50 new cases in
  `dsh-research-bench/data/claims-heldout` (seven synthetic source paragraphs,
  new topics, wording and numbers), frozen on 2026-11-08 at
  `sha256:016eaa67ba12ec1b3022e68dbc627b414c43733551fdd457b70dd1907e81d470`
  before the first evaluation run. `pnpm run bench:claims-holdout` verifies the
  freeze hash and writes `bench/results-claims-holdout.{json,md}`.
- README (English and Chinese) now reports the held-out set separately from the
  regression baseline, with an explicit independence caveat and the two failing
  categories (negation cue `failed to`; hedge cue `seems tied to`).

### Notes

- Held-out result: verdict accuracy 0.96 (48/50), over-claim rate 0.0571
  (2/35), false-alarm rate on supported claims 0.00. No runtime code changed.

## [0.1.2] - 2026-11-08

### Added

- Frozen 50-case held-out claim set and `pnpm run bench:claims-holdout`. The held-out run scores 48/50; the two misses (`failed to` negation, `seems tied to` hedge) are kept as evidence and are not tuned away. The held-out set is a same-author time split, not a blind estimate.

## [0.1.1] - 2026-11-08

### Changed

- Release-engineering refresh: CHANGELOG accuracy, package metadata and authors; no runtime changes.

## [0.1.0] - 2026-11-08

- Packaging: published as `@perrylink/dsh-claim-check`; npm rejects the
  unscoped name as too similar to the existing `dsh-claimcheck` package.

### Fixed

- Re-running the same claim check no longer fails with `STORE_ERROR`: evidence
  identity includes the claim and its anchors, and timestamps come from the
  immutable snapshot, so an unchanged check dedupes.
- `locateQuote` mapped the normalized match back by searching for the first
  token, which could point at an earlier sentence (and feed the wrong sentence
  to the polarity/strength checks) when a token repeated. Offsets now come from
  an exact or whitespace-flexible raw match that slices back to the quote.
- Possessives (`authors' findings`) were parsed as single-quoted spans and
  produced false "quote absent" failures; single-quote delimiters must now be
  word-separated.
- `claim_bind` built its locator against `snapshotIds[0]` even when the text
  came from a later snapshot (e.g. the extracted text of a PDF-backed
  doc_anchor evidence); it now records the snapshot it actually read.
- `package.json#author` said `dsh-statcheck contributors` on the claim-check
  package.

First release: byte-level claim support checking.

### Added

- `claim_check`: verbatim span check, number matching, labelled-value
  contradiction (`d = 0.80` vs `d = 0.45`), negation polarity and hedging
  strength checks with exact character locators.
- `claim_bind`: the same checks against a textual snapshot already stored by
  another research plugin.
- `claim_report`: Markdown + SARIF 2.1.0.
- REP v1 integration: source snapshot, claim registration, verdict and checks
  are written through the core store and sealed into a record.
- 25 tests; benchmark on `dsh-research-bench` claims v0.1.0 (50 cases): verdict
  accuracy 1.00, over-claim rate 0.00, false-alarm rate on supported claims 0.00.

### Notes

- Paraphrases are `insufficient` by design; v0.1 does not do semantics.
- Benchmark numbers are a regression baseline: cases and rules were developed
  together, and the polarity rule was narrowed during development. A held-out
  set is required before any release accuracy claim.
