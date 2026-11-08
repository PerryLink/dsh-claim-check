// Claim-support benchmark adapter for dsh-claim-check.
//
// Reads dsh-research-bench `data/claims/cases.jsonl`, evaluates each claim
// against its frozen source paragraph with the plugin's pure evaluator, and
// prints verdict accuracy plus the safety rates that matter most:
// over-claim rate (unsupported labelled verified) and false-alarm rate on
// supported claims. No network, no model calls.
//
// Usage: node bench/run-claims.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateClaimText } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const benchRoot = process.env.BENCH_DIR ?? path.resolve(here, '..', '..', 'dsh-research-bench')
const cases = readFileSync(path.join(benchRoot, 'data', 'claims', 'cases.jsonl'), 'utf8')
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => JSON.parse(line))
const summary = JSON.parse(readFileSync(path.join(benchRoot, 'data', 'claims', 'SUMMARY.json'), 'utf8'))

const predictions = cases.map(caseItem => {
  const result = evaluateClaimText({ claim: caseItem.claim, source: caseItem.source })
  return { id: caseItem.id, category: caseItem.category, prediction: { verdict: result.verdict } }
})

const ratio = (numerator, denominator) => (denominator === 0 ? null : Number((numerator / denominator).toFixed(4)))
const labels = ['verified', 'insufficient', 'contradicted', 'disproven']
const perLabel = {}
for (const label of labels) perLabel[label] = { tp: 0, fp: 0, fn: 0 }
let correct = 0
let overclaim = 0
let falseAlarm = 0
let supported = 0
const byCategory = {}
for (const [index, caseItem] of cases.entries()) {
  const predicted = predictions[index].prediction.verdict
  const truth = caseItem.expected.verdict
  if (predicted === truth) correct += 1
  const category = caseItem.category
  byCategory[category] = byCategory[category] ?? { total: 0, correct: 0 }
  byCategory[category].total += 1
  if (predicted === truth) byCategory[category].correct += 1
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
}

const metrics = {
  dataset: { name: summary.dataset, version: summary.version, total: summary.total, cases: cases.length },
  plugin: '@perrylink/dsh-claim-check',
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
  byCategory: Object.fromEntries(Object.entries(byCategory).map(([category, value]) => [category, { ...value, accuracy: ratio(value.correct, value.total) }])),
}

const report = { command: 'node bench/run-claims.mjs', benchDir: benchRoot, metrics, predictions }
const jsonFlag = process.argv.indexOf('--json')
if (jsonFlag !== -1 && process.argv[jsonFlag + 1] !== undefined) {
  writeFileSync(process.argv[jsonFlag + 1], `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

console.log(`# dsh-claim-check × dsh-research-bench (${summary.dataset} v${summary.version}, ${cases.length} cases)`)
console.log('')
console.log('| metric | value |')
console.log('|---|---:|')
for (const [key, value] of [
  ['verdict accuracy', metrics.verdictAccuracy],
  ['verified precision', metrics.perLabel.verified.precision],
  ['verified recall', metrics.perLabel.verified.recall],
  ['insufficient precision', metrics.perLabel.insufficient.precision],
  ['insufficient recall', metrics.perLabel.insufficient.recall],
  ['contradicted precision', metrics.perLabel.contradicted.precision],
  ['contradicted recall', metrics.perLabel.contradicted.recall],
  ['disproven precision', metrics.perLabel.disproven.precision],
  ['disproven recall', metrics.perLabel.disproven.recall],
  ['over-claim rate (unsupported called verified)', metrics.overclaimRate],
  ['false-alarm rate on supported claims', metrics.falseAlarmRateOnSupported],
]) {
  console.log(`| ${key} | ${value === null ? 'n/a' : value} |`)
}
const wrong = predictions.filter((item, index) => item.prediction.verdict !== cases[index].expected.verdict)
if (wrong.length > 0) {
  console.log('')
  console.log(`Cases whose verdict differs from the label: ${wrong.length}`)
  for (const item of wrong.slice(0, 12)) console.log(`  ${item.id} (${item.category}): ${item.prediction.verdict} (label ${cases.find(c => c.id === item.id).expected.verdict})`)
}
