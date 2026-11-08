/**
 * Deterministic claim evaluation.
 *
 * This is the deliberately non-semantic core: a claim is checked against the
 * source text by (1) whether its quoted spans occur verbatim, (2) whether its
 * numbers occur in the source, (3) whether a labelled value contradicts the
 * source's value for the same label, and (4) whether the claim's polarity or
 * strength matches the sentence the quote came from (negation and hedging).
 *
 * No embeddings, no model call: every verdict can be recomputed by a human with
 * the same two strings. A paraphrase with no verbatim span is `insufficient`,
 * not "supported" — v0.1 does not pretend to do semantics.
 *
 * @module dsh-claim-check/evaluate
 */

import {
  extractNumericTokens,
  normalizeText,
  numericTokensEqual,
  stableId,
  type CheckResult,
  type Verdict,
} from '@perrylink/dsh-research-core'

/** Input for {@link evaluateClaimText}. */
export interface ClaimEvaluationInput {
  /** The claim text (untrusted). */
  readonly claim: string
  /** The source text it cites (untrusted). */
  readonly source: string
  /** Explicit quote to check; otherwise quotations inside the claim are used. */
  readonly quote?: string
}

/** The evaluation outcome. */
export interface ClaimEvaluationResult {
  readonly checks: CheckResult[]
  readonly verdict: Verdict
  /** Quoted spans that were checked (verbatim). */
  readonly quotes: { readonly text: string; readonly found: boolean; readonly charStart: number; readonly charEnd: number }[]
  /** Labelled values found in the claim and their source counterparts. */
  readonly labels: { readonly label: string; readonly claimValue: string; readonly sourceValue?: string; readonly match: boolean }[]
}

/** Negation cues in English text. */
const NEGATION = /\b(?:not|no|never|none|neither|nor|without|cannot|can't|didn't|doesn't|don't|wasn't|weren't|isn't|aren't|couldn't|wouldn't)\b|n't\b/iu

/** Hedging / association cues that weaken a source sentence. */
const HEDGE = /\b(?:may|might|could|possibly|preliminary|suggest(?:s|ed)?|associated|correlat(?:e|ed|ion)|consistent with)\b/iu

/** Directional/result words whose negation scope matters. */
const DIRECTION = /(?:improv|reduc|increas|decreas|significant|differ|effective|benefit|lower|higher|associated)/iu

/** Causal-overclaim cues in a claim. */
const OVERCLAIM = /\b(?:proves?|proven|demonstrates?|confirms?|causes?|caused|leads? to|led to|established|definitive)\b/iu

/** Labelled values such as `n = 30`, `d = 0.45`, `OR = 0.98`, `t(28) = 2.50`. */
const LABELLED = /\b(n|d|OR|RR|HR|p|r|t|F|z|χ²|M|SD|SE)\s*(?:\([^)]*\))?\s*=\s*(-?\d*\.?\d+)/gu

/** Extract quoted spans (`"..."`, `“...”`, `‘...’`, `'...'`) from a claim. */
export function quotesOf(claim: string): string[] {
  const quotes: string[] = []
  for (const match of claim.matchAll(/["“”]([^"“”]{3,300})["“”]/gu)) quotes.push(match[1]!.trim())
  for (const match of claim.matchAll(/[‘’']([^‘’']{3,300})[‘’']/gu)) quotes.push(match[1]!.trim())
  return [...new Set(quotes.filter(quote => quote !== ''))]
}

/** Find a quote in the source (normalized substring search). */
function locateQuote(quote: string, source: string): { found: boolean; charStart: number; charEnd: number } {
  const needle = normalizeText(quote)
  if (needle === '') return { found: false, charStart: -1, charEnd: -1 }
  const haystack = normalizeText(source)
  const index = haystack.indexOf(needle)
  if (index === -1) return { found: false, charStart: -1, charEnd: -1 }
  // Map the normalized offset back to the raw source approximately: find the
  // same start token in the raw text.
  const firstToken = needle.split(' ')[0] ?? ''
  const rawIndex = firstToken === '' ? -1 : source.toLowerCase().indexOf(firstToken)
  return {
    found: true,
    charStart: rawIndex === -1 ? index : rawIndex,
    charEnd: rawIndex === -1 ? index + needle.length : Math.min(source.length, rawIndex + quote.length),
  }
}

/** The sentence of the source that contains the (found) quote. */
export function sentenceAround(source: string, charStart: number): string {
  if (charStart < 0) return ''
  const boundaries = /[.!?]\s+/gu
  let start = 0
  let end = source.length
  for (const match of source.matchAll(boundaries)) {
    const boundary = match.index + 1
    if (boundary <= charStart) start = boundary + (match[0].length - 1)
    else {
      end = match.index + 1
      break
    }
  }
  return source.slice(Math.max(0, start), Math.min(source.length, end)).trim()
}

/** Build one check. */
function check(
  subject: string,
  kind: CheckResult['check'],
  status: CheckResult['status'],
  detail: string,
  options: {
    code?: CheckResult['code']
    severity?: CheckResult['severity']
    expected?: unknown
    actual?: unknown
    key?: string
  } = {},
): CheckResult {
  const digest = stableId('chk', [subject, kind, options.expected ?? '', status]).slice(-6)
  return {
    checkId: `chk-${options.key ?? kind}-${digest}`,
    check: kind,
    status,
    detail,
    ...(options.code === undefined ? {} : { code: options.code }),
    severity: options.severity ?? (status === 'fail' ? 'error' : status === 'warn' ? 'warning' : 'info'),
    ...(options.expected === undefined ? {} : { expected: options.expected }),
    ...(options.actual === undefined ? {} : { actual: options.actual }),
  }
}

/** Compare labelled values between claim and source. */
function compareLabels(claim: string, source: string): NonNullable<ClaimEvaluationResult['labels']> {
  const sourceLabels = new Map<string, string[]>()
  for (const match of source.matchAll(LABELLED)) {
    const label = match[1]!.toLowerCase()
    const values = sourceLabels.get(label) ?? []
    values.push(match[2]!)
    sourceLabels.set(label, values)
  }
  const results: { label: string; claimValue: string; sourceValue?: string; match: boolean }[] = []
  for (const match of claim.matchAll(LABELLED)) {
    const label = match[1]!.toLowerCase()
    const claimValue = match[2]!
    const sourceValues = sourceLabels.get(label)
    if (sourceValues === undefined) continue
    const claimNumber = Number(claimValue)
    const matched = sourceValues.some(value => {
      const sourceNumber = Number(value)
      return numericTokensEqual(
        { raw: claimValue, value: claimNumber, unit: '' },
        { raw: value, value: sourceNumber, unit: '' },
      )
    })
    results.push({
      label,
      claimValue,
      ...(sourceValues[0] === undefined ? {} : { sourceValue: sourceValues[0] }),
      match: matched,
    })
  }
  return results
}

/**
 * Evaluate one claim against one source text.
 * @param input - claim, source and optional explicit quote.
 * @returns checks, verdict, quote locators and label comparisons.
 */
export function evaluateClaimText(input: ClaimEvaluationInput): ClaimEvaluationResult {
  const claim = input.claim
  const source = input.source
  const subject = claim.slice(0, 48)
  const checks: CheckResult[] = []
  const quotes = input.quote === undefined ? quotesOf(claim) : [input.quote]
  const located = quotes.map(quote => ({ text: quote, ...locateQuote(quote, source) }))

  // ── 1. verbatim spans ────────────────────────────────────────────────────
  if (located.length === 0) {
    checks.push(
      check(subject, 'quote-span', 'skipped', 'the claim carries no quoted span, so no verbatim location can be checked', {
        code: 'not_applicable',
        key: 'quote',
      }),
    )
  } else {
    for (const quote of located) {
      checks.push(
        check(
          subject,
          'quote-span',
          quote.found ? 'pass' : 'fail',
          quote.found
            ? `quote located verbatim at characters ${quote.charStart}-${quote.charEnd}`
            : 'the quoted span does not occur verbatim in the source',
          { expected: quote.text, actual: { found: quote.found, charStart: quote.charStart }, key: 'quote' },
        ),
      )
    }
  }

  // ── 2. numbers ───────────────────────────────────────────────────────────
  const claimNumbers = extractNumericTokens(claim)
  const sourceNumbers = extractNumericTokens(source)
  if (claimNumbers.length > 0) {
    const missing = claimNumbers.filter(number => !sourceNumbers.some(candidate => numericTokensEqual(number, candidate)))
    checks.push(
      check(
        subject,
        'number-match',
        missing.length === 0 ? 'pass' : 'fail',
        missing.length === 0
          ? `all ${claimNumbers.length} numeric literal(s) occur in the source`
          : `${missing.length} of ${claimNumbers.length} numeric literal(s) do not occur in the source: ${missing.map(number => number.raw).join(', ')}`,
        { expected: claimNumbers.map(number => number.raw), actual: { missing: missing.map(number => number.raw) }, key: 'numbers' },
      ),
    )
  }

  // ── 3. labelled values ───────────────────────────────────────────────────
  const labels = compareLabels(claim, source)
  const labelMismatch = labels.filter(label => !label.match)
  if (labelMismatch.length > 0) {
    for (const mismatch of labelMismatch) {
      checks.push(
        check(
          subject,
          'number-match',
          'fail',
          `labelled value mismatch: claim says ${mismatch.label} = ${mismatch.claimValue}, the source says ${mismatch.label} = ${mismatch.sourceValue ?? '(unknown)'}`,
          { expected: mismatch.claimValue, actual: mismatch.sourceValue, key: 'label' },
        ),
      )
    }
  }

  // ── 4. polarity / strength of the cited sentence ────────────────────────
  const primary = located.find(quote => quote.found)
  const sentence = primary === undefined ? '' : sentenceAround(source, primary.charStart)
  if (primary !== undefined && sentence !== '') {
    const sourceNegated = NEGATION.test(sentence)
    const claimNegated = NEGATION.test(claim)
    // Only a directional fragment can be flipped: quoting a CI or a sample size
    // does not assert a direction, so a missing "not" there is not a mismatch.
    if (DIRECTION.test(primary.text) && sourceNegated !== claimNegated) {
      checks.push(
        check(
          subject,
          'other',
          'fail',
          sourceNegated
            ? `the cited sentence is negated ("${sentence.slice(0, 160)}"), but the claim is not`
            : `the cited sentence is affirmative, but the claim is negated ("${sentence.slice(0, 160)}")`,
          { expected: { sourceNegated, claimNegated }, actual: { sentence: sentence.slice(0, 300) }, key: 'polarity' },
        ),
      )
    }
    const hedged = HEDGE.test(sentence)
    const overclaimed = OVERCLAIM.test(claim)
    if (hedged && overclaimed) {
      checks.push(
        check(
          subject,
          'other',
          'fail',
          `the source sentence is hedged or associational ("${sentence.slice(0, 160)}"), but the claim states a causal conclusion`,
          { expected: 'hedged', actual: 'causal', key: 'strength' },
        ),
      )
    }
  }

  // ── 5. verdict ───────────────────────────────────────────────────────────
  const quoteFail = checks.some(item => item.checkId.startsWith('chk-quote-') && item.status === 'fail')
  const labelFail = checks.some(item => item.checkId.startsWith('chk-label-') && item.status === 'fail')
  const polarityFail = checks.some(item => (item.checkId.startsWith('chk-polarity-') || item.checkId.startsWith('chk-strength-')) && item.status === 'fail')
  const numbersFail = checks.some(item => item.checkId.startsWith('chk-numbers-') && item.status === 'fail')
  const quotePass = checks.some(item => item.checkId.startsWith('chk-quote-') && item.status === 'pass')
  const numbersPass = checks.some(item => item.checkId.startsWith('chk-numbers-') && item.status === 'pass')

  let verdict: Verdict
  if (quoteFail || labelFail) verdict = 'disproven'
  else if (polarityFail) verdict = 'contradicted'
  else if (quotePass && (!numbersFail || numbersPass)) verdict = 'verified'
  else verdict = 'insufficient'

  return { checks, verdict, quotes: located, labels }
}
