/**
 * `dsh-claim-check` — deterministic claim support checking.
 *
 * Three tools: claim_check (against inline text or a file), claim_bind (against
 * stored evidence), claim_report (Markdown + SARIF). Verdicts come from verbatim
 * spans, numbers, labelled values and the polarity/strength of the cited
 * sentence. Paraphrases are `insufficient`, never "supported".
 *
 * Function plugin — no default export.
 * @module dsh-claim-check
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type Config as ConfigShape } from './config.ts'
import { ClaimCheckRuntime, type EvidencePort } from './runtime.ts'
import { makeClaimBindTool } from './tools/claim-bind.ts'
import { makeClaimCheckTool } from './tools/claim-check.ts'
import { makeClaimReportTool } from './tools/claim-report.ts'

/** Cordis plugin name. */
export const name = 'claim-check'

/** The tool registry is required; the REP service is optional. */
export const inject = ['tools']

export { Config, resolveConfig }
export type { ConfigShape }
export type { ResolvedConfig } from './config.ts'
export { VERSION } from './version.ts'
export { evaluateClaimText, quotesOf, sentenceAround } from './evaluate.ts'
export type { ClaimEvaluationInput, ClaimEvaluationResult } from './evaluate.ts'
export { renderClaimMarkdown, renderClaimSarif } from './report.ts'
export { ClaimCheckError, ClaimCheckRuntime } from './runtime.ts'
export type {
  ClaimBindRequest,
  ClaimCheckErrorCode,
  ClaimCheckRequest,
  ClaimCheckResult,
  ClaimCheckRuntimeOptions,
  EvidencePort,
} from './runtime.ts'
export { makeClaimCheckTool } from './tools/claim-check.ts'
export { makeClaimBindTool } from './tools/claim-bind.ts'
export { makeClaimReportTool } from './tools/claim-report.ts'

/**
 * Mount the three tools.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('claim-check')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no tools are mounted')
    return
  }
  const service = ctx.get('researchEvidence') as EvidencePort | undefined
  const runtime = new ClaimCheckRuntime({ config: resolved, ...(service === undefined ? {} : { service }) })
  if (service === undefined) {
    logger.info(`ctx.researchEvidence is not mounted; using a local core store under ${resolved.root}`)
  }
  ctx.effect(() => ctx.tools.register(makeClaimCheckTool(runtime)), 'claim-check: claim_check tool')
  ctx.effect(() => ctx.tools.register(makeClaimBindTool(runtime)), 'claim-check: claim_bind tool')
  ctx.effect(() => ctx.tools.register(makeClaimReportTool()), 'claim-check: claim_report tool')
}
