/**
 * `claim_report` — render a verdict as Markdown + SARIF.
 * @module dsh-claim-check/tools/claim-report
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CheckResult, Verdict } from '@perrylink/dsh-research-core'
import { renderClaimMarkdown, renderClaimSarif } from '../report.ts'
import { VERSION } from '../version.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    markdown: { type: 'string' },
    sarif: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `claim_report` tool.
 * @returns the tool definition.
 */
export function makeClaimReportTool() {
  return defineTool({
    name: 'claim_report',
    description: [
      'Render a claim verdict as a Markdown report and a SARIF 2.1.0 log (dsh-claim-check).',
      '',
      'Pass the claim, the verdict and the checks returned by claim_check / claim_bind. Failed and warning checks become SARIF results; the Markdown states explicitly what the verdict does and does not mean.',
    ].join('\n'),
    parameters: {
      claim: { type: 'string', required: true, description: 'The claim.' },
      verdict: { type: 'string', required: true, description: 'verified | unverified | insufficient | contradicted | disproven.' },
      checks: { type: 'array', items: { type: 'json' }, description: 'Checks from claim_check / claim_bind.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; markdown: string } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `claim_report failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: result.markdown }]
      },
    },
    async execute(args: unknown) {
      const request = args as { claim?: string; verdict?: string; checks?: CheckResult[] }
      const claim = request.claim ?? ''
      const verdict = (request.verdict ?? 'insufficient') as Verdict
      const checks = Array.isArray(request.checks) ? request.checks : []
      return {
        ok: true as const,
        markdown: renderClaimMarkdown(claim, verdict, checks),
        sarif: renderClaimSarif(claim, verdict, checks, VERSION) as never,
      }
    },
  })
}
