/**
 * `claim_bind` — check a claim against an evidence item already in the REP store.
 * @module dsh-claim-check/tools/claim-bind
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { ClaimCheckError, type ClaimCheckRuntime } from '../runtime.ts'
import { CHECK_SCHEMA, ERROR_SCHEMA, plainChecks } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    verdict: { type: 'string' },
    checks: { type: 'array', items: CHECK_SCHEMA },
    quotes: { type: 'array', items: { type: 'json' } },
    labels: { type: 'array', items: { type: 'json' } },
    evidenceId: { type: 'string' },
    claimId: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `claim_bind` tool.
 * @param runtime - the claim-check runtime.
 * @returns the tool definition.
 */
export function makeClaimBindTool(runtime: ClaimCheckRuntime) {
  return defineTool({
    name: 'claim_bind',
    description: [
      'Check a claim against an evidence snapshot already stored by doc_anchor / cite_verify / another research plugin (dsh-claim-check).',
      '',
      'Reads the textual snapshot of the evidence from the REP store and applies the same deterministic checks as claim_check (verbatim span, numbers, labelled values, polarity/strength). The resulting claim + verdict are written to the same store.',
    ].join('\n'),
    parameters: {
      claim: { type: 'string', required: true, description: 'The claim as written, including any quoted span.' },
      evidenceId: { type: 'string', required: true, description: 'Evidence id from the REP store.' },
      quote: { type: 'string', description: 'Explicit quote to check.' },
      persist: { type: 'boolean', description: 'Write the claim + verdict (default true).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; verdict: string; checks: Array<{ status: string; detail: string }> } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `claim_bind failed (${result.error.code}): ${result.error.message}` }]
        const lines = [`claim_bind: ${result.verdict}`]
        for (const check of result.checks) lines.push(`  [${check.status}] ${check.detail}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args: unknown) {
      const request = args as Parameters<ClaimCheckRuntime['bind']>[0]
      try {
        const result = await runtime.bind(request)
        return {
          ok: true as const,
          verdict: result.verdict,
          checks: plainChecks(result.checks),
          quotes: result.quotes.map(quote => ({ ...quote })),
          labels: result.labels.map(label => ({ ...label })),
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.claimId === undefined ? {} : { claimId: result.claimId }),
        }
      } catch (error) {
        if (error instanceof ClaimCheckError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
