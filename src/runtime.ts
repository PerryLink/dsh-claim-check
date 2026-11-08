/**
 * Runtime: source loading, REP evidence/claim registration and report output.
 *
 * The claim's verdict is written through the core store, so the record carries
 * the evidence snapshot, the claim registration and the checks that justify the
 * verdict. A later reader can recompute every check from the stored bytes.
 *
 * @module dsh-claim-check/runtime
 */

import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EvidenceStore,
  RepStoreError,
  stableId,
  validateRep,
  type AddEvidenceInput,
  type Anchor,
  type CaptureInput,
  type CheckResult,
  type Evidence,
  type HashRef,
  type ResearchRecord,
  type Snapshot,
  type Verdict,
} from '@perrylink/dsh-research-core'
import type { ResolvedConfig } from './config.ts'
import { evaluateClaimText, type ClaimEvaluationResult } from './evaluate.ts'
import { VERSION } from './version.ts'

/** Stable runtime error codes. */
export type ClaimCheckErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PATH_ESCAPE'
  | 'NOT_A_FILE'
  | 'TOO_LARGE'
  | 'EVIDENCE_UNKNOWN'
  | 'STORE_ERROR'

/** A typed failure. */
export class ClaimCheckError extends Error {
  /** Stable code. */
  readonly code: ClaimCheckErrorCode

  constructor(code: ClaimCheckErrorCode, message: string) {
    super(message)
    this.name = 'ClaimCheckError'
    this.code = code
  }
}

/** The subset of the REP service used here. */
export interface EvidencePort {
  capture(input: CaptureInput): Promise<{ snapshot: Snapshot }>
  addEvidence(input: AddEvidenceInput): Promise<{ evidence: Evidence }>
  getEvidence(evidenceId: string): Promise<Evidence | undefined>
  getSnapshot(snapshotId: HashRef): Promise<{ snapshot: Snapshot; bytes: Uint8Array } | undefined>
  addClaim(input: { claimId: string; text: string; type: 'result' | 'quote' | 'number' | 'other'; evidenceRefs: readonly string[]; locator?: Anchor }): Promise<{ claim: { claimId: string } }>
  setVerdict(claimId: string, verdict: Verdict, checks: readonly CheckResult[]): Promise<unknown>
  buildRecord(options?: { evidenceIds?: readonly string[]; claimIds?: readonly string[] }): Promise<Omit<ResearchRecord, 'manifest'>>
}

/** Request for {@link ClaimCheckRuntime.check}. */
export interface ClaimCheckRequest {
  readonly claim: string
  readonly text?: string
  readonly path?: string
  readonly quote?: string
  readonly persist?: boolean
}

/** Request for {@link ClaimCheckRuntime.bind}. */
export interface ClaimBindRequest {
  readonly claim: string
  readonly evidenceId: string
  readonly quote?: string
  readonly persist?: boolean
}

/** The success value shared by check/bind. */
export interface ClaimCheckResult {
  readonly ok: true
  readonly verdict: Verdict
  readonly checks: readonly CheckResult[]
  readonly quotes: ClaimEvaluationResult['quotes']
  readonly labels: ClaimEvaluationResult['labels']
  readonly evidenceId?: string
  readonly claimId?: string
  readonly recordPath?: string
}

/** Options for {@link ClaimCheckRuntime}. */
export interface ClaimCheckRuntimeOptions {
  readonly config: ResolvedConfig
  readonly service?: EvidencePort
  readonly now?: () => Date
}

/** True when `candidate` is inside `root`. */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
}

/** Media type by extension. */
function mediaTypeOf(name: string): Snapshot['mediaType'] {
  const extension = name.toLowerCase().split('.').pop() ?? ''
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'tex' || extension === 'latex') return 'text/x-latex'
  if (extension === 'html' || extension === 'htm') return 'text/html'
  return 'text/plain'
}

/** The claim-check runtime. */
export class ClaimCheckRuntime {
  readonly config: ResolvedConfig

  readonly #service: EvidencePort | undefined
  readonly #now: () => Date
  #store: EvidenceStore | undefined

  constructor(options: ClaimCheckRuntimeOptions) {
    this.config = options.config
    this.#service = options.service
    this.#now = options.now ?? (() => new Date())
  }

  /** Current ISO timestamp. */
  iso(): string {
    return this.#now().toISOString()
  }

  /** The evidence port. */
  port(): EvidencePort {
    if (this.#service !== undefined) return this.#service
    this.#store ??= new EvidenceStore(path.join(this.config.root, 'store'))
    return this.#store
  }

  /** Resolve a source path inside the workspace. */
  async resolvePath(input: string): Promise<{ absolute: string; id: string }> {
    if (typeof input !== 'string' || input.trim() === '') throw new ClaimCheckError('INVALID_INPUT', 'path must be a non-empty string')
    const root = this.config.workspaceRoot
    let realRoot: string
    try {
      realRoot = await realpath(root)
    } catch {
      throw new ClaimCheckError('NOT_FOUND', `workspace root does not exist: ${root}`)
    }
    const candidate = path.resolve(realRoot, input)
    if (!isInside(realRoot, candidate)) throw new ClaimCheckError('PATH_ESCAPE', 'path resolves outside the workspace root')
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new ClaimCheckError('NOT_FOUND', `source not found: ${input}`)
    }
    if (!isInside(realRoot, real)) throw new ClaimCheckError('PATH_ESCAPE', 'path escapes the workspace root through a symlink')
    if (!(await stat(real)).isFile()) throw new ClaimCheckError('NOT_A_FILE', `not a regular file: ${input}`)
    return { absolute: real, id: path.relative(realRoot, real).split(path.sep).join('/') }
  }

  /** Read one source document with the byte cap enforced. */
  async #readSource(request: { text?: string; path?: string }): Promise<{ text: string; sourceRef: AddEvidenceInput['sourceRef']; mediaType: Snapshot['mediaType']; id: string }> {
    if ((request.text === undefined) === (request.path === undefined)) {
      throw new ClaimCheckError('INVALID_INPUT', 'pass exactly one of text or path')
    }
    if (request.text !== undefined) {
      if (request.text.length > this.config.maxChars) {
        throw new ClaimCheckError('TOO_LARGE', `source is ${request.text.length} characters, the cap is ${this.config.maxChars}`)
      }
      return {
        text: request.text,
        sourceRef: { kind: 'other', id: 'inline:source', retrievedAt: this.iso() },
        mediaType: 'text/plain',
        id: 'inline:source',
      }
    }
    const resolved = await this.resolvePath(request.path!)
    const size = (await stat(resolved.absolute)).size
    if (size > this.config.maxChars * 4) throw new ClaimCheckError('TOO_LARGE', `source is ${size} bytes, the cap is ${this.config.maxChars * 4}`)
    const text = await readFile(resolved.absolute, 'utf8')
    if (text.length > this.config.maxChars) throw new ClaimCheckError('TOO_LARGE', `source is ${text.length} characters, the cap is ${this.config.maxChars}`)
    return {
      text,
      sourceRef: { kind: 'file', id: resolved.id, retrievedAt: this.iso() },
      mediaType: mediaTypeOf(resolved.id),
      id: resolved.id,
    }
  }

  /** Register evidence + claim + verdict and write the record. */
  async #persist(source: { text: string; sourceRef: AddEvidenceInput['sourceRef']; mediaType: Snapshot['mediaType']; id: string }, claim: string, evaluation: ClaimEvaluationResult): Promise<{ evidenceId: string; claimId: string; recordPath: string }> {
    const port = this.port()
    const anchors: Anchor[] = evaluation.quotes
      .filter(quote => quote.found)
      .map(quote => ({
        snapshotId: `sha256:${'0'.repeat(64)}` as HashRef,
        kind: 'char' as const,
        value: `c.${quote.charStart}-${quote.charEnd}`,
        charRange: { start: quote.charStart, end: quote.charEnd },
        quote: quote.text,
      }))
    let captured: { snapshot: Snapshot }
    try {
      captured = await port.capture({ bytes: source.text, mediaType: source.mediaType, sourceRef: source.sourceRef, capturedAt: this.iso() })
    } catch (error) {
      if (error instanceof RepStoreError) throw new ClaimCheckError('STORE_ERROR', error.message)
      throw error
    }
    const withSnapshot = anchors.map(anchor => ({ ...anchor, snapshotId: captured.snapshot.snapshotId }))
    if (withSnapshot.length === 0) {
      withSnapshot.push({ snapshotId: captured.snapshot.snapshotId, kind: 'record', value: 'field:text' })
    }
    // The evidence records one claim's view of the source: different claims
    // legitimately anchor different spans, so the claim is part of the identity.
    // Timestamps come from the immutable snapshot so re-running the same check
    // dedupes instead of failing with EVIDENCE_CONFLICT.
    const evidenceSourceRef = { ...source.sourceRef, retrievedAt: captured.snapshot.capturedAt }
    const evidenceId = stableId('ev', [
      'claim-check',
      source.id,
      captured.snapshot.snapshotId,
      claim,
      ...withSnapshot.map(anchor => `${anchor.value}:${anchor.charRange?.start ?? -1}-${anchor.charRange?.end ?? -1}`),
    ])
    const claimId = stableId('cl', [claim, evidenceId])
    try {
      await port.addEvidence({
        evidenceId,
        title: `Source text for claim check (${source.id})`,
        sourceRef: evidenceSourceRef,
        snapshotIds: [captured.snapshot.snapshotId],
        anchors: withSnapshot,
        provenance: { plugin: 'dsh-claim-check', version: VERSION, method: 'quote-span+number-match+polarity', retrievedAt: captured.snapshot.capturedAt },
      })
      await port.addClaim({
        claimId,
        text: claim,
        type: 'quote',
        evidenceRefs: [evidenceId],
        ...(withSnapshot[0] === undefined ? {} : { locator: withSnapshot[0] }),
      })
      await port.setVerdict(claimId, evaluation.verdict, evaluation.checks)
    } catch (error) {
      if (error instanceof RepStoreError) throw new ClaimCheckError('STORE_ERROR', error.message)
      throw error
    }
    try {
      const record = await port.buildRecord({ evidenceIds: [evidenceId], claimIds: [claimId] })
      if (!validateRep(record).ok) throw new ClaimCheckError('STORE_ERROR', 'refusing to write an invalid REP record')
      const directory = path.join(this.config.root, 'records')
      await mkdir(directory, { recursive: true })
      const file = path.join(directory, `${claimId}.rep.json`)
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      return { evidenceId, claimId, recordPath: file }
    } catch (error) {
      if (error instanceof ClaimCheckError) throw error
      throw new ClaimCheckError('STORE_ERROR', `could not write the REP record: ${(error as Error).message}`)
    }
  }

  /**
   * Check one claim against inline text or a workspace file.
   * @param request - claim, source and options.
   * @returns the verdict, checks and (when persisting) evidence/claim ids.
   */
  async check(request: ClaimCheckRequest): Promise<ClaimCheckResult> {
    if (typeof request.claim !== 'string' || request.claim.trim() === '') throw new ClaimCheckError('INVALID_INPUT', 'claim must be a non-empty string')
    const source = await this.#readSource(request)
    const evaluation = evaluateClaimText({
      claim: request.claim,
      source: source.text,
      ...(request.quote === undefined ? {} : { quote: request.quote }),
    })
    const base = { ok: true as const, verdict: evaluation.verdict, checks: evaluation.checks, quotes: evaluation.quotes, labels: evaluation.labels }
    if (request.persist === false || this.config.persist === false) return base
    const stored = await this.#persist(source, request.claim, evaluation)
    return { ...base, ...stored }
  }

  /**
   * Check a claim against an evidence item already in the store.
   * @param request - claim and evidence id.
   * @returns the verdict and checks (persisted as a new claim + verdict).
   */
  async bind(request: ClaimBindRequest): Promise<ClaimCheckResult> {
    if (typeof request.claim !== 'string' || request.claim.trim() === '') throw new ClaimCheckError('INVALID_INPUT', 'claim must be a non-empty string')
    const port = this.port()
    const evidence = await port.getEvidence(request.evidenceId)
    if (evidence === undefined) throw new ClaimCheckError('EVIDENCE_UNKNOWN', `unknown evidence ${request.evidenceId}`)
    let text: string | undefined
    let textSnapshotId: HashRef | undefined
    for (const snapshotId of evidence.snapshotIds) {
      const view = await port.getSnapshot(snapshotId)
      if (view === undefined) continue
      if (view.snapshot.mediaType.startsWith('text/')) {
        text = Buffer.from(view.bytes).toString('utf8')
        textSnapshotId = snapshotId
        break
      }
    }
    if (text === undefined) throw new ClaimCheckError('INVALID_INPUT', 'the evidence has no textual snapshot; text-based claim checks need one')
    const evaluation = evaluateClaimText({ claim: request.claim, source: text, ...(request.quote === undefined ? {} : { quote: request.quote }) })
    const base = { ok: true as const, verdict: evaluation.verdict, checks: evaluation.checks, quotes: evaluation.quotes, labels: evaluation.labels }
    if (request.persist === false || this.config.persist === false) return base
    const port2 = this.port()
    const claimId = stableId('cl', [request.claim, request.evidenceId])
    try {
      await port2.addClaim({
        claimId,
        text: request.claim,
        type: 'quote',
        evidenceRefs: [request.evidenceId],
        ...(evaluation.quotes[0]?.found === true
          ? {
              locator: {
                snapshotId: textSnapshotId!,
                kind: 'char' as const,
                value: `c.${evaluation.quotes[0].charStart}-${evaluation.quotes[0].charEnd}`,
                charRange: { start: evaluation.quotes[0].charStart, end: evaluation.quotes[0].charEnd },
                quote: evaluation.quotes[0].text,
              },
            }
          : {}),
      })
      await port2.setVerdict(claimId, evaluation.verdict, evaluation.checks)
    } catch (error) {
      if (error instanceof RepStoreError) throw new ClaimCheckError('STORE_ERROR', error.message)
      throw error
    }
    return { ...base, evidenceId: request.evidenceId, claimId }
  }
}
