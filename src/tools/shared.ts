/**
 * Shared tool schema fragments.
 * @module dsh-claim-check/tools/shared
 */

/** The failure branch. */
export const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
} as const

/** One check. */
export const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    checkId: { type: 'string', required: true },
    check: { type: 'string', required: true },
    status: { type: 'string', required: true },
    detail: { type: 'string', required: true },
    code: { type: 'string' },
    severity: { type: 'string' },
    expected: { type: 'json' },
    actual: { type: 'json' },
  },
} as const

/** Project checks into lossless JSON. */
export function plainChecks(checks: readonly { checkId: string; check: string; status: string; detail: string; code?: string; severity?: string; expected?: unknown; actual?: unknown }[]) {
  return checks.map(check => ({
    checkId: check.checkId,
    check: check.check,
    status: check.status,
    detail: check.detail,
    ...(check.code === undefined ? {} : { code: check.code }),
    ...(check.severity === undefined ? {} : { severity: check.severity }),
    ...(check.expected === undefined ? {} : { expected: check.expected as never }),
    ...(check.actual === undefined ? {} : { actual: check.actual as never }),
  }))
}
