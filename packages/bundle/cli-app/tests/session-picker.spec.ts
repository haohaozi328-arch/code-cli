/**
 * REAL-harness coverage for the session picker's data path: real persistence,
 * projection registry, projection cache, and the storage stack. Regression:
 * the terminal profile mounts no session-controller, so the picker's
 * `sessionListMetadata` unit must come from this bundle — without the
 * registration every session was filtered out and /sessions stayed empty.
 * @module tests/session-picker.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import type {} from '@deepseek-ai/dsh-session-persistence'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { applySessionListMetadata, registerSessionListProjection } from '../src/list-projection.ts'
import { listPersistedSessions } from '../src/sessions.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function bootPicker(): Promise<Context> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cli-picker-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(root, 'storages') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 1, writeIntervalMs: 1 })
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  return ctx
}

function appendTurnEvents(session: Session): void {
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  session.append('assistant/message', {
    stream: [], turn: 1, step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: 're: hello' }], source: { provider: 'mock', model: 'mock' } }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
}

/** Materialize one live session's log through the real persistence handle. */
async function persistSession(ctx: Context, id: string): Promise<void> {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd: 'D:/work/picker' } })
  appendTurnEvents(session)
  const handle = await ctx.sessionPersistence.create(session.header)
  await handle.append(session.snapshotEvents())
  await handle.flush()
  await handle.close()
}

const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 25) })

describe('registerSessionListProjection', () => {
  it('makes a conversed session visible to the picker through the cache path', async () => {
    const ctx = await bootPicker()
    registerSessionListProjection(ctx)
    await persistSession(ctx, 'picker-talked')
    await settle()
    const rows = await listPersistedSessions(ctx)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.sessionId).toBe('picker-talked')
    expect(row?.blank).toBe(false)
    expect(row?.cwd).toBe('D:/work/picker')
  })

  it('lists backlog sessions written before the registration (cold-read path)', async () => {
    const ctx = await bootPicker()
    // No registration yet: the checkpoint carries no sessionListMetadata
    // cell — exactly the on-disk state of every pre-fix terminal session.
    await persistSession(ctx, 'picker-backlog')
    registerSessionListProjection(ctx)
    const rows = await listPersistedSessions(ctx)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.sessionId).toBe('picker-backlog')
    expect(row?.blank).toBe(false)
  })

  it('keeps an untouched session out of the picker', async () => {
    const ctx = await bootPicker()
    registerSessionListProjection(ctx)
    const session = ctx.sessions.create(SessionId('picker-blank'), { meta: { cwd: 'D:/work/picker' } })
    const handle = await ctx.sessionPersistence.create(session.header)
    await handle.flush()
    await handle.close()
    const rows = await listPersistedSessions(ctx)
    expect(rows).toHaveLength(0)
  })
})

describe('applySessionListMetadata', () => {
  it('folds blank and lastPromptAt over a real session log', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('picker-fold'))
    appendTurnEvents(session)

    let state = { blank: true, lastPromptAt: null as number | null }
    let sawUserPromptAt: number | null = null
    for (const event of session.snapshotEvents()) {
      if (event.type === 'user/message' && event.data.source.kind === 'user') sawUserPromptAt = event.time
      state = applySessionListMetadata(state, event)
    }
    expect(state.blank).toBe(false)
    expect(state.lastPromptAt).toBe(sawUserPromptAt)
  })

  it('keeps an unchanged state reference and treats a bare step as blank', () => {
    const initial = { blank: true, lastPromptAt: null as number | null }
    const stepOnly = { type: 'step/start', time: 1, data: { turn: 1, step: 1 } } as unknown as Parameters<typeof applySessionListMetadata>[1]
    expect(applySessionListMetadata(initial, stepOnly)).toBe(initial)
  })
})
