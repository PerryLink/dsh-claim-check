/**
 * Claim evaluation: verbatim spans, numbers, labelled values, polarity, hedging.
 * @module test/evaluate.spec
 */

import { describe, expect, it } from 'vitest'
import { evaluateClaimText, quotesOf, sentenceAround } from '../src/evaluate.ts'

const S1 = 'In this synthetic trial the treatment group improved (t(28) = 2.50, p = .018), with a standardized effect of d = 0.45.'
const S2 = 'The intervention did not reduce readmission rates (OR = 0.98, 95% CI [0.72, 1.33]).'
const S3 = 'Symptoms may be associated with sleep quality, but the evidence is preliminary.'
const S4 = 'There was no significant difference between groups (p = .62).'

/** Evaluate one claim against one source. */
function evaluate(claim: string, source: string) {
  return evaluateClaimText({ claim, source })
}

describe('quote extraction', () => {
  it('finds double-quoted and single-quoted spans', () => {
    expect(quotesOf('The authors say "the effect was small" and “it replicated”.')).toEqual(['the effect was small', 'it replicated'])
    expect(quotesOf("They call it 'preliminary'.")).toEqual(['preliminary'])
  })

  it('locates the sentence around a quote', () => {
    const start = S2.indexOf('reduce')
    expect(sentenceAround(S2, start)).toContain('did not reduce')
  })
})

describe('verdicts', () => {
  it('verifies a claim whose quote and numbers are present', () => {
    expect(evaluate('The trial reports "the treatment group improved (t(28) = 2.50, p = .018)".', S1).verdict).toBe('verified')
  })

  it('marks a paraphrase without a verbatim span as insufficient, never supported', () => {
    const result = evaluate('Treatment improved outcomes with an effect size of d = 0.45.', S1)
    expect(result.verdict).toBe('insufficient')
    expect(result.checks.find(check => check.checkId.startsWith('chk-quote-'))?.code).toBe('not_applicable')
  })

  it('disproves a claim whose quote is absent', () => {
    const result = evaluate('The authors claim "the effect was definitive".', S1)
    expect(result.verdict).toBe('disproven')
    expect(result.checks.find(check => check.checkId.startsWith('chk-quote-'))?.status).toBe('fail')
  })

  it('disproves a labelled value that contradicts the source', () => {
    const result = evaluate('The trial reports "the treatment group improved (t(28) = 2.50, p = .018)" and d = 0.80.', S1)
    expect(result.verdict).toBe('disproven')
    const label = result.checks.find(check => check.checkId.startsWith('chk-label-') && check.status === 'fail')
    expect(label?.detail).toContain('d = 0.80')
    expect(label?.detail).toContain('d = 0.45')
  })

  it('contradicts a claim that flips a negated sentence', () => {
    const result = evaluate('The intervention "reduce readmission rates" (OR = 0.98).', S2)
    expect(result.verdict).toBe('contradicted')
    expect(result.checks.some(check => check.checkId.startsWith('chk-polarity-') && check.status === 'fail')).toBe(true)
  })

  it('contradicts a causal claim built on a hedged sentence', () => {
    const result = evaluate('The data "associated with sleep quality" proves a causal pathway.', S3)
    expect(result.verdict).toBe('contradicted')
    expect(result.checks.some(check => check.checkId.startsWith('chk-strength-') && check.status === 'fail')).toBe(true)
  })

  it('keeps an accurate report of a null result verified', () => {
    expect(evaluate('The authors report "no significant difference between groups (p = .62)".', S4).verdict).toBe('verified')
  })

  it('does not flip polarity on a quoted interval', () => {
    expect(evaluate('The study reports an OR of 0.98 ("95% CI [0.72, 1.33]").', S2).verdict).toBe('verified')
  })

  it('reports an absent number as insufficient, not as a contradiction', () => {
    const result = evaluate('The trial reports "the treatment group improved (t(28) = 2.50, p = .018)" in n = 300 patients.', S1)
    expect(result.verdict).toBe('insufficient')
    expect(result.checks.some(check => check.checkId.startsWith('chk-numbers-') && check.status === 'fail')).toBe(true)
  })

  it('marks a claim about absent content as insufficient', () => {
    expect(evaluate('Adverse events were rare.', S4).verdict).toBe('insufficient')
  })
})
