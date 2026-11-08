# dsh-claim-check × held-out claims (claims-heldout v0.1.0, 50 cases)

**Frozen:** 2026-11-08 · `sha256:016eaa67ba12ec1b3022e68dbc627b414c43733551fdd457b70dd1907e81d470` (verified at run time)

| metric | regression baseline (`claims` v0.1.0) | held-out |
|---|---:|---:|
| verdict accuracy | 1.00 | 0.96 |
| over-claim rate (unsupported called verified) | 0.00 | 0.06 |
| false-alarm rate on supported claims | 0.00 | 0.00 |

## Per-verdict precision / recall

| verdict | precision | recall | tp | fp | fn | baseline precision | baseline recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| verified | 0.88 | 1.00 | 15 | 2 | 0 | 1.00 | 1.00 |
| insufficient | 1.00 | 1.00 | 15 | 0 | 0 | 1.00 | 1.00 |
| contradicted | 1.00 | 0.83 | 10 | 0 | 2 | 1.00 | 1.00 |
| disproven | 1.00 | 1.00 | 8 | 0 | 0 | 1.00 | 1.00 |

## Per-category accuracy

| category | cases | correct | accuracy | baseline accuracy |
|---|---:|---:|---:|---:|
| supported | 15 | 15 | 1.00 | 1.00 |
| paraphrase | 10 | 10 | 1.00 | 1.00 |
| number-wrong | 8 | 8 | 1.00 | 1.00 |
| negated | 7 | 6 | 0.86 | 1.00 |
| quote-mined | 5 | 4 | 0.80 | 1.00 |
| insufficient | 5 | 5 | 1.00 | 1.00 |

## Mismatches (2)

- `claim-0034` (negated): expected `contradicted`, predicted `verified`
  - claim: The coating "improve rate capability at 4.2 V" (OR = 1.11).
  - failing checks: none (the relevant cue was not recognized)
- `claim-0045` (quote-mined): expected `contradicted`, predicted `verified`
  - claim: Cooling "seems tied to canopy density" proves that tree canopy causes cooler streets.
  - failing checks: none (the relevant cue was not recognized)

## Freeze and independence

The cases were authored from `rubric/CLAIMS.md` and frozen before the first evaluation run; the SHA-256 above is checked on every run. Labels were not changed after the freeze. This is a same-author temporal hold-out, not a blind external audit.

