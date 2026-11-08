# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

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
- 21 tests; benchmark on `dsh-research-bench` claims v0.1.0 (50 cases): verdict
  accuracy 1.00, over-claim rate 0.00, false-alarm rate on supported claims 0.00.

### Notes

- Paraphrases are `insufficient` by design; v0.1 does not do semantics.
- Benchmark numbers are a regression baseline: cases and rules were developed
  together, and the polarity rule was narrowed during development. A held-out
  set is required before any release accuracy claim.
