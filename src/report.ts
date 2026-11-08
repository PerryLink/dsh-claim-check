/**
 * Markdown and SARIF rendering for claim verdicts.
 * @module dsh-claim-check/report
 */

import type { CheckResult, Verdict } from '@perrylink/dsh-research-core'

/** Render a claim verdict as Markdown. */
export function renderClaimMarkdown(claim: string, verdict: Verdict, checks: readonly CheckResult[]): string {
  const lines = ['# Claim verdict', '', `**Claim:** ${claim.replace(/\n/gu, ' ')}`, '', `**Verdict:** \`${verdict}\``, '']
  if (verdict === 'insufficient') {
    lines.push('> `insufficient` means the available evidence cannot decide the claim — it is not false, and it is not "clean".')
    lines.push('')
  }
  if (verdict === 'contradicted' || verdict === 'disproven') {
    lines.push('> The evidence contradicts the claim as written. This is a finding about the text, not about the authors; review the quoted span and the source sentence.')
    lines.push('')
  }
  lines.push('| Check | Status | Detail | Expected | Actual |')
  lines.push('|---|---|---|---|---|')
  for (const check of checks) {
    const expected = check.expected === undefined ? '' : JSON.stringify(check.expected).replace(/\|/gu, '\\|').slice(0, 120)
    const actual = check.actual === undefined ? '' : JSON.stringify(check.actual).replace(/\|/gu, '\\|').slice(0, 120)
    lines.push(`| ${check.check} | ${check.status}${check.code === undefined ? '' : ` (${check.code})`} | ${check.detail.replace(/\|/gu, '\\|')} | ${expected} | ${actual} |`)
  }
  return `${lines.join('\n')}\n`
}

/** Render a claim verdict as SARIF 2.1.0. */
export function renderClaimSarif(claim: string, verdict: Verdict, checks: readonly CheckResult[], version: string): Record<string, unknown> {
  const results = checks
    .filter(check => check.status === 'fail' || check.status === 'warn')
    .map(check => ({
      ruleId: `claim-check/${check.check}`,
      level: check.status === 'fail' ? 'error' : 'warning',
      message: { text: `${check.detail} — claim: ${claim.slice(0, 240)}` },
      properties: { verdict, status: check.status, code: check.code ?? null, expected: check.expected ?? null, actual: check.actual ?? null },
    }))
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'dsh-claim-check', version } }, results }],
  }
}
