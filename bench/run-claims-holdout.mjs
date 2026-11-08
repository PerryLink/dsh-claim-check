// Held-out claim-support benchmark adapter for dsh-claim-check.
//
// Reads the frozen `dsh-research-bench/data/claims-heldout` cases, verifies the
// SHA-256 freeze record before doing any evaluation, then measures the same
// safety metrics as the regression baseline:
//   - verdict accuracy and per-verdict precision / recall
//   - over-claim rate (unsupported labelled verified)
//   - false-alarm rate on supported claims
//   - per-category accuracy
//
// No network, no model calls, no timestamps. Writes
// `bench/results-claims-holdout.json` and `bench/results-claims-holdout.md`.
//
// Usage: node bench/run-claims-holdout.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateClaimText } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const benchRoot = process.env.BENCH_DIR ?? path.resolve(here, '..', '..', 'dsh-research-bench')
const datasetDir = path.join(benchRoot, 'data', 'claims-heldout')
const jsonPath = path.join(here, 'results-claims-holdout.json')
const markdownPath = path.join(here, 'results-claims-holdout.md')
const labels = ['verified', 'insufficient', 'contradicted', 'disproven']
const categoryVerdict = {
  supported: 'verified',
  paraphrase: 'insufficient',
  'number-wrong': 'disproven',
  negated: 'contradicted',
  'quote-mined': 'contradicted',
  insufficient: 'insufficient',
}

const fail = message => {
  console.error(`run-claims-holdout: ${message}`)
  process.exit(1)
}
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex')
const ratio = (numerator, denominator) => (denominator === 0 ? null : Number((numerator / denominator).toFixed(4)))

const casesText = readFileSync(path.join(datasetDir, 'cases.jsonl'), 'utf8')
let summary
try {
  summary = JSON.parse(readFileSync(path.join(datasetDir, 'SUMMARY.json'), 'utf8'))
} catch (error) {
  fail(`cannot read held-out SUMMARY.json: ${error.message}`)
}
let schema
try {
  schema = JSON.parse(readFileSync(path.join(datasetDir, 'schema.json'), 'utf8'))
} catch (error) {
  fail(`cannot read held-out schema.json: ${error.message}`)
}

// ── freeze gate: evaluate only the bytes whose hash was frozen ──────────────
if (summary.heldOut !== true || summary.frozen !== true) fail('SUMMARY.json must declare heldOut: true and frozen: true')
if (summary.dataset !== 'claims-heldout') fail(`unexpected dataset name: ${String(summary.dataset)}`)
if (summary.hashAlgorithm !== 'sha256') fail(`unexpected hash algorithm: ${String(summary.hashAlgorithm)}`)
const actualSha256 = sha256(casesText)
if (actualSha256 !== summary.caseSha256) {
  fail(`freeze hash mismatch: SUMMARY says ${String(summary.caseSha256)}, cases.jsonl hashes to ${actualSha256}`)
}
if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
  fail(`schema.json must use JSON Schema 2020-12, found ${String(schema.$schema)}`)
}

const cases = casesText
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => JSON.parse(line))
if (cases.length !== summary.total) fail(`SUMMARY.total is ${String(summary.total)}, dataset has ${cases.length} cases`)
if (new Set(cases.map(item => item.id)).size !== cases.length) fail('duplicate held-out case id')

const countsByCategory = {}
const countsByVerdict = {}
for (const item of cases) {
  if (categoryVerdict[item.category] !== item.expected?.verdict) {
    fail(`${item.id}: category ${String(item.category)} is labelled ${String(item.expected?.verdict)}`)
  }
  countsByCategory[item.category] = (countsByCategory[item.category] ?? 0) + 1
  countsByVerdict[item.expected.verdict] = (countsByVerdict[item.expected.verdict] ?? 0) + 1
}
for (const [category, count] of Object.entries(countsByCategory)) {
  if (summary.byCategory?.[category] !== count) fail(`SUMMARY.byCategory.${category} disagrees with the dataset`)
}
for (const [verdict, count] of Object.entries(countsByVerdict)) {
  if (summary.byVerdict?.[verdict] !== count) fail(`SUMMARY.byVerdict.${verdict} disagrees with the dataset`)
}

// ── evaluate ────────────────────────────────────────────────────────────────
const results = cases.map(caseItem => ({
  caseItem,
  result: evaluateClaimText({ claim: caseItem.claim, source: caseItem.source }),
}))

const perLabel = {}
for (const label of labels) perLabel[label] = { tp: 0, fp: 0, fn: 0 }
const confusion = Object.fromEntries(labels.map(truth => [truth, Object.fromEntries(labels.map(predicted => [predicted, 0]))]))
let correct = 0
let overclaim = 0
let falseAlarm = 0
let supported = 0
const byCategory = {}
const predictions = []
const mismatches = []
for (const { caseItem, result } of results) {
  const predicted = result.verdict
  const truth = caseItem.expected.verdict
  predictions.push({
    id: caseItem.id,
    category: caseItem.category,
    expected: truth,
    prediction: { verdict: predicted },
  })
  if (predicted === truth) correct += 1
  confusion[truth][predicted] += 1
  byCategory[caseItem.category] = byCategory[caseItem.category] ?? { total: 0, correct: 0 }
  byCategory[caseItem.category].total += 1
  if (predicted === truth) byCategory[caseItem.category].correct += 1
  for (const label of labels) {
    if (truth === label && predicted === label) perLabel[label].tp += 1
    else if (truth !== label && predicted === label) perLabel[label].fp += 1
    else if (truth === label && predicted !== label) perLabel[label].fn += 1
  }
  if (truth !== 'verified' && predicted === 'verified') overclaim += 1
  if (truth === 'verified') {
    supported += 1
    if (predicted !== 'verified') falseAlarm += 1
  }
  if (predicted !== truth) {
    const failedChecks = result.checks.filter(item => item.status === 'fail')
    mismatches.push({
      id: caseItem.id,
      category: caseItem.category,
      claim: caseItem.claim,
      expected: truth,
      predicted,
      quotes: result.quotes.map(quote => ({ text: quote.text, found: quote.found })),
      failedChecks: failedChecks.map(item => ({ check: item.check, detail: item.detail })),
      checkStatuses: result.checks.map(item => ({ check: item.check, status: item.status })),
    })
  }
}

const metrics = {
  dataset: { name: summary.dataset, version: summary.version, total: summary.total, cases: cases.length, heldOut: summary.heldOut, frozenAt: summary.frozenAt, caseSha256: summary.caseSha256 },
  plugin: '@perrylink/dsh-claim-check',
  correct,
  total: cases.length,
  verdictAccuracy: ratio(correct, cases.length),
  perLabel: Object.fromEntries(
    labels.map(label => [
      label,
      {
        precision: ratio(perLabel[label].tp, perLabel[label].tp + perLabel[label].fp),
        recall: ratio(perLabel[label].tp, perLabel[label].tp + perLabel[label].fn),
        ...perLabel[label],
      },
    ]),
  ),
  overclaimRate: ratio(overclaim, cases.length - supported),
  falseAlarmRateOnSupported: ratio(falseAlarm, supported),
  supportedCases: supported,
  byCategory: Object.fromEntries(
    Object.entries(byCategory).map(([category, value]) => [category, { ...value, accuracy: ratio(value.correct, value.total) }]),
  ),
  confusion,
}

// ── optional comparison with the committed regression baseline ──────────────
let baselineComparison = null
try {
  const baseline = JSON.parse(readFileSync(path.join(here, 'results-claims.json'), 'utf8'))
  const baselineMetrics = baseline.metrics
  baselineComparison = {
    dataset: baselineMetrics.dataset.name,
    version: baselineMetrics.dataset.version,
    verdictAccuracy: baselineMetrics.verdictAccuracy,
    perLabel: Object.fromEntries(labels.map(label => [label, {
      precision: baselineMetrics.perLabel[label].precision,
      recall: baselineMetrics.perLabel[label].recall,
    }])),
    overclaimRate: baselineMetrics.overclaimRate,
    falseAlarmRateOnSupported: baselineMetrics.falseAlarmRateOnSupported,
    byCategory: Object.fromEntries(Object.entries(baselineMetrics.byCategory).map(([category, value]) => [category, value.accuracy])),
  }
} catch {
  baselineComparison = null
}

const report = {
  command: 'node bench/run-claims-holdout.mjs',
  datasetDir: 'dsh-research-bench/data/claims-heldout',
  freeze: { algorithm: 'sha256', caseSha256: actualSha256, verified: true },
  metrics,
  baselineComparison,
  predictions,
  mismatches,
}
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

// ── deterministic markdown report ───────────────────────────────────────────
const format = value => (value === null ? 'n/a' : Number(value).toFixed(2))
const baselineValue = (key, fallback) => (baselineComparison === null ? 'n/a' : format(fallback(baselineComparison, key)))
const baselineLabel = baselineComparison === null ? 'regression baseline' : `regression baseline (\`${baselineComparison.dataset}\` v${baselineComparison.version})`
const markdown = []
markdown.push(`# dsh-claim-check × held-out claims (${summary.dataset} v${summary.version}, ${cases.length} cases)`)
markdown.push('')
markdown.push(`**Frozen:** ${summary.frozenAt} · \`sha256:${actualSha256}\` (verified at run time)`)
markdown.push('')
markdown.push('| metric | ' + baselineLabel + ' | held-out |')
markdown.push('|---|---:|---:|')
for (const [label, current, baseline] of [
  ['verdict accuracy', metrics.verdictAccuracy, value => value.verdictAccuracy],
  ['over-claim rate (unsupported called verified)', metrics.overclaimRate, value => value.overclaimRate],
  ['false-alarm rate on supported claims', metrics.falseAlarmRateOnSupported, value => value.falseAlarmRateOnSupported],
]) {
  markdown.push(`| ${label} | ${baselineValue(label, baseline)} | ${format(current)} |`)
}
markdown.push('')
markdown.push('## Per-verdict precision / recall')
markdown.push('')
markdown.push('| verdict | precision | recall | tp | fp | fn | baseline precision | baseline recall |')
markdown.push('|---|---:|---:|---:|---:|---:|---:|---:|')
for (const label of labels) {
  const current = metrics.perLabel[label]
  const baseline = baselineComparison === null ? null : baselineComparison.perLabel[label]
  markdown.push(`| ${label} | ${format(current.precision)} | ${format(current.recall)} | ${current.tp} | ${current.fp} | ${current.fn} | ${baseline === null ? 'n/a' : format(baseline.precision)} | ${baseline === null ? 'n/a' : format(baseline.recall)} |`)
}
markdown.push('')
markdown.push('## Per-category accuracy')
markdown.push('')
markdown.push('| category | cases | correct | accuracy | baseline accuracy |')
markdown.push('|---|---:|---:|---:|---:|')
for (const [category, value] of Object.entries(metrics.byCategory)) {
  const baseline = baselineComparison === null ? null : (baselineComparison.byCategory[category] ?? null)
  markdown.push(`| ${category} | ${value.total} | ${value.correct} | ${format(value.accuracy)} | ${baseline === null ? 'n/a' : format(baseline)} |`)
}
markdown.push('')
markdown.push(`## Mismatches (${mismatches.length})`)
markdown.push('')
if (mismatches.length === 0) {
  markdown.push('None: every held-out case matches its frozen label.')
} else {
  for (const mismatch of mismatches) {
    markdown.push(`- \`${mismatch.id}\` (${mismatch.category}): expected \`${mismatch.expected}\`, predicted \`${mismatch.predicted}\``)
    markdown.push(`  - claim: ${mismatch.claim}`)
    if (mismatch.failedChecks.length === 0) markdown.push('  - failing checks: none (the relevant cue was not recognized)')
    else for (const check of mismatch.failedChecks) markdown.push(`  - failing check: ${check.check}: ${check.detail}`)
  }
}
markdown.push('')
markdown.push('## Freeze and independence')
markdown.push('')
markdown.push('The cases were authored from `rubric/CLAIMS.md` and frozen before the first evaluation run; the SHA-256 above is checked on every run. Labels were not changed after the freeze. This is a same-author temporal hold-out, not a blind external audit.')
markdown.push('')
const markdownText = `${markdown.join('\n')}\n`
writeFileSync(markdownPath, markdownText, 'utf8')
console.log(markdownText.trimEnd())
