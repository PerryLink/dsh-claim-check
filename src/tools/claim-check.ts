/**
 * `claim_check` — does the source support the claim as written?
 * @module dsh-claim-check/tools/claim-check
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
    recordPath: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `claim_check` tool.
 * @param runtime - the claim-check runtime.
 * @returns the tool definition.
 */
export function makeClaimCheckTool(runtime: ClaimCheckRuntime) {
  return defineTool({
    name: 'claim_check',
    description: [
      'Check whether a claim is supported by a source text, deterministically (dsh-claim-check).',
      '',
      'Checks: (1) every quoted span in the claim occurs verbatim in the source; (2) every number in the claim occurs in the source; (3) a labelled value (n, d, OR, p, …) that contradicts the source value with the same label disproves the claim; (4) the polarity and strength of the sentence the quote came from (negation, hedging) must match the claim.',
      '',
      'Verdicts: `verified` (verbatim span + numbers agree), `disproven` (quote absent or labelled value contradicts), `contradicted` (negation/strength mismatch), `insufficient` (no verbatim span, or a number is missing — a paraphrase is NOT "supported" in v0.1). No embeddings, no model call: every verdict is recomputable from the two strings.',
    ].join('\n'),
    parameters: {
      claim: { type: 'string', required: true, description: 'The claim as written, including any quoted span.' },
      text: { type: 'string', description: 'Source text (mutually exclusive with path).' },
      path: { type: 'string', description: 'Workspace-relative source file (.txt/.md/.tex/.html).' },
      quote: { type: 'string', description: 'Explicit quote to check (overrides quotations extracted from the claim).' },
      persist: { type: 'boolean', description: 'Store evidence + claim + record (default true).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; verdict: string; checks: Array<{ status: string; detail: string }>; evidenceId?: string } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `claim_check failed (${result.error.code}): ${result.error.message}` }]
        const lines = [`claim_check: ${result.verdict}`]
        for (const check of result.checks) lines.push(`  [${check.status}] ${check.detail}`)
        if (result.verdict === 'insufficient' || result.verdict === 'unverified') {
          lines.push('  note: insufficient means the evidence cannot decide the claim — it is not false and not "clean"')
        }
        if (result.evidenceId !== undefined) lines.push(`evidence ${result.evidenceId}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args: unknown) {
      const request = args as Parameters<ClaimCheckRuntime['check']>[0]
      try {
        const result = await runtime.check(request)
        return {
          ok: true as const,
          verdict: result.verdict,
          checks: plainChecks(result.checks),
          quotes: result.quotes.map(quote => ({ ...quote })),
          labels: result.labels.map(label => ({ ...label })),
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.claimId === undefined ? {} : { claimId: result.claimId }),
          ...(result.recordPath === undefined ? {} : { recordPath: result.recordPath }),
        }
      } catch (error) {
        if (error instanceof ClaimCheckError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
