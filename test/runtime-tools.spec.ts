/**
 * Runtime + tool surface: REP records, path safety, bind, report.
 * @module test/runtime-tools.spec
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateRep } from '@perrylink/dsh-research-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { ClaimCheckRuntime } from '../src/runtime.ts'
import { makeClaimBindTool } from '../src/tools/claim-bind.ts'
import { VERSION } from '../src/version.ts'
import { makeClaimCheckTool } from '../src/tools/claim-check.ts'
import { makeClaimReportTool } from '../src/tools/claim-report.ts'

const AT = new Date('2026-06-01T09:00:00.000Z')
const SOURCE = 'In this synthetic trial the treatment group improved (t(28) = 2.50, p = .018); the effect was d = 0.45.'
const CLAIM = 'The trial reports "the treatment group improved (t(28) = 2.50, p = .018)".'
let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'claim-check-'))
  await writeFile(path.join(workspace, 'source.md'), SOURCE, 'utf8')
})

afterEach(async () => {
  if (workspace.startsWith(tmpdir())) await rm(workspace, { recursive: true, force: true })
})

/** Build a runtime over the temp workspace. */
function runtime(): ClaimCheckRuntime {
  return new ClaimCheckRuntime({
    config: resolveConfig({ workspaceRoot: workspace, root: path.join(workspace, '.claim-check') }),
    now: () => AT,
  })
}

const EXEC = {} as never

describe('runtime', () => {
  it('persists evidence, claim and a valid record with the verdict', async () => {
    const rt = runtime()
    const result = await rt.check({ claim: CLAIM, path: 'source.md' })
    expect(result.verdict).toBe('verified')
    expect(result.evidenceId).toMatch(/^ev-/u)
    expect(result.claimId).toMatch(/^cl-/u)
    const record = JSON.parse(await readFile(result.recordPath!, 'utf8')) as { claims: Array<{ verdict: string; checks: unknown[] }> } & unknown
    expect(validateRep(record).ok, JSON.stringify(validateRep(record).issues)).toBe(true)
    expect(record.claims[0]?.verdict).toBe('verified')
    expect(record.claims[0]?.checks.length).toBeGreaterThan(0)
  })

  it('does not persist with persist=false', async () => {
    const result = await runtime().check({ claim: CLAIM, text: SOURCE, persist: false })
    expect(result.evidenceId).toBeUndefined()
  })

  it('rejects path traversal', async () => {
    await expect(runtime().check({ claim: 'x "y"', path: '../escape.md' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
  })

  it('binds a new claim to stored evidence', async () => {
    const rt = runtime()
    const first = await rt.check({ claim: CLAIM, text: SOURCE })
    const bound = await rt.bind({ claim: 'The study reports "d = 0.45" for the effect.', evidenceId: first.evidenceId! })
    expect(bound.verdict).toBe('verified')
    expect(bound.claimId).not.toBe(first.claimId)
  })

  it('re-checks the same claim without an evidence conflict', async () => {
    const initial = await runtime().check({ claim: CLAIM, text: SOURCE })
    const later = new ClaimCheckRuntime({
      config: resolveConfig({ workspaceRoot: workspace, root: path.join(workspace, '.claim-check') }),
      now: () => new Date('2026-06-02T09:00:00.000Z'),
    })
    const again = await later.check({ claim: CLAIM, text: SOURCE })
    expect(again.verdict).toBe(initial.verdict)
    expect(again.evidenceId).toBe(initial.evidenceId)
    expect(again.claimId).toBe(initial.claimId)
  })

  it('binds a locator to the textual snapshot, not the first snapshot', async () => {
    const rt = runtime()
    const port = rt.port()
    const original = await port.capture({
      bytes: Buffer.from('%PDF-1.4 synthetic'),
      mediaType: 'application/pdf',
      sourceRef: { kind: 'file', id: 'paper.pdf', retrievedAt: AT.toISOString() },
      capturedAt: AT.toISOString(),
    })
    const textual = await port.capture({
      bytes: SOURCE,
      mediaType: 'text/plain',
      sourceRef: { kind: 'file', id: 'paper.pdf', retrievedAt: AT.toISOString() },
      capturedAt: AT.toISOString(),
    })
    const { evidence } = await port.addEvidence({
      evidenceId: 'ev-doc-anchor-test',
      title: 'Anchored paper',
      sourceRef: { kind: 'file', id: 'paper.pdf', retrievedAt: AT.toISOString() },
      snapshotIds: [original.snapshot.snapshotId, textual.snapshot.snapshotId],
      anchors: [{ snapshotId: textual.snapshot.snapshotId, kind: 'record', value: 'field:text' }],
      provenance: { plugin: 'test', version: '0.0.0', method: 'fixture', retrievedAt: AT.toISOString() },
    })
    const bound = await rt.bind({ claim: 'The trial reports "d = 0.45".', evidenceId: evidence.evidenceId })
    const record = await port.buildRecord({ claimIds: [bound.claimId!] })
    const claim = (record as unknown as { claims: Array<{ locator?: { snapshotId: string } }> }).claims[0]
    expect(claim?.locator?.snapshotId).toBe(textual.snapshot.snapshotId)
  })
})

describe('tools', () => {
  it('declares names, parameter schemas and output schemas', () => {
    for (const [tool, name] of [
      [makeClaimCheckTool(runtime()), 'claim_check'],
      [makeClaimBindTool(runtime()), 'claim_bind'],
      [makeClaimReportTool(), 'claim_report'],
    ] as const) {
      expect(tool.name).toBe(name)
      expect(Object.keys(tool.parameters).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
      expect(typeof tool.output.render).toBe('function')
    }
  })

  it('claim_check returns a verdict and readable render', async () => {
    const tool = makeClaimCheckTool(runtime())
    const value = (await tool.execute({ claim: CLAIM, text: SOURCE, persist: false }, EXEC)) as { ok: true; verdict: string }
    expect(value.ok).toBe(true)
    expect(value.verdict).toBe('verified')
    const blocks = tool.output.render({}, value as never) as Array<{ text: string }>
    expect(blocks[0]?.text).toContain('claim_check')
  })

  it('claim report renders markdown and SARIF', async () => {
    const value = (await makeClaimReportTool().execute(
      { claim: 'The authors claim "the effect was definitive".', verdict: 'disproven', checks: [{ checkId: 'chk-quote-x', check: 'quote-span', status: 'fail', detail: 'absent' }] },
      EXEC,
    )) as { ok: true; markdown: string; sarif: { version: string; runs: Array<{ results: unknown[] }> } }
    expect(value.markdown).toContain('disproven')
    expect(value.sarif.version).toBe('2.1.0')
    expect(value.sarif.runs[0]?.results.length).toBe(1)
  })

  it('failure branch carries a stable code', async () => {
    const value = (await makeClaimCheckTool(runtime()).execute({ claim: '' }, EXEC)) as { ok: false; error: { code: string } }
    expect(value.ok).toBe(false)
    expect(value.error.code).toBe('INVALID_INPUT')
  })
})

describe('package', () => {
  it('VERSION matches package.json and the patch lists its keys', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    expect(pkg['name']).toBe('dsh-claim-check')
    expect(pkg['version']).toBe(VERSION)
    expect(pkg['author']).toBe('dsh-claim-check contributors')
    expect(pkg['dsh']).toEqual({ manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } })
  })
})
