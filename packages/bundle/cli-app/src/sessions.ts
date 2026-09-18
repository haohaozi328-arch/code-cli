/**
 * Session-surface helpers for the terminal app: persisted-session catalog
 * (id/title/cwd/time/event count), fork-seed collection over a live session
 * log, and display formatting. Pure reads 鈥?no session is opened for the
 * catalog; titles come from the persisted projection cache when available.
 * @module @dsh-external/dsh-cli-app/sessions
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionLogOffset, type Session, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
// Empty type imports carry the ctx service merges this module reads.
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session-projection'

/** One row of the resume picker. */
export interface SessionSummary {
  readonly sessionId: string
  /** Best-effort title from the projection cache; null when unavailable. */
  readonly title: string | null
  /** Absolute working directory the session was created in, when recorded. */
  readonly cwd: string | null
  /** Creation time, Unix epoch milliseconds. */
  readonly createdAt: number
  /** Last user-prompt activity time; used for newest-first ordering. */
  readonly updatedAt: number
  /** True when the session has no user-authored conversation yet. */
  readonly blank: boolean
  /** The session this one was forked from, when seeded. */
  readonly parentSession: string | null
}

/** Reasonable ceiling for one picker page; the catalog sorts newest first. */
const PICKER_LIMIT = 50

/**
 * Read the persisted-session catalog through official seams only.
 * @param ctx - process context carrying the persistence and title-cache services.
 * @returns the newest sessions, capped at one picker page.
 */
export async function listPersistedSessions(ctx: Context): Promise<SessionSummary[]> {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return []
  let snapshots: readonly SessionPersistenceSnapshot[]
  try {
    snapshots = await persistence.list()
  } catch {
    return []
  }
  const cache = ctx.get('sessionProjectionCache')
  if (cache === undefined) return []
  const rows: SessionSummary[] = []
  for (const snapshot of snapshots) {
    const header = snapshot.header
    const metadata = cachedListMetadata(cache, header)
    // A session is a real conversation only after a user-authored prompt has
    // been committed. This deliberately excludes untouched sessions created by /new.
    if (metadata?.blank !== false) continue
    rows.push({
      sessionId: header.id,
      title: cachedTitleOf(cache, header),
      cwd: header.cwd ?? null,
      createdAt: header.createdAt,
      updatedAt: metadata.lastPromptAt ?? header.createdAt,
      blank: false,
      parentSession: header.parentSession ?? null,
    })
  }
  rows.sort((left, right) => right.updatedAt - left.updatedAt)
  return rows.slice(0, PICKER_LIMIT)
}

/** Read the list metadata projection without opening the session. */
function cachedListMetadata(cache: unknown, header: SessionHeader): { blank: boolean; lastPromptAt: number | null } | undefined {
  const service = cache as {
    cachedSnapshot?(meta: SessionHeader, inheritedEventCount: SessionLogOffset, keys?: readonly string[]): { values: Record<string, unknown> } | undefined
  }
  const snapshot = service.cachedSnapshot?.(header, SessionLogOffset(0), ['sessionListMetadata'])
  const value = snapshot?.values['sessionListMetadata']
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.blank !== 'boolean') return undefined
  return {
    blank: record.blank,
    lastPromptAt: typeof record.lastPromptAt === 'number' ? record.lastPromptAt : null,
  }
}

/** Best-effort zero-I/O title read: current cache row first, predecessor fallback. */
function cachedTitleOf(cache: unknown, header: SessionHeader): string | null {
  const service = cache as {
    cachedSnapshot?(
      meta: SessionHeader,
      inheritedEventCount: SessionLogOffset,
      keys?: readonly string[],
    ): { values: Record<string, unknown> } | undefined
    cachedPredecessorTitle?(
      meta: SessionHeader,
      inheritedEventCount: SessionLogOffset,
    ): { values: Record<string, unknown> } | undefined
  }
  const current = service.cachedSnapshot?.(header, SessionLogOffset(0), ['title'])
  const title = current?.values['title']
  if (typeof title === 'string' && title !== '') return title
  const predecessor = service.cachedPredecessorTitle?.(header, SessionLogOffset(0))
  const oldTitle = predecessor?.values['title']
  return typeof oldTitle === 'string' && oldTitle !== '' ? oldTitle : null
}

/**
 * The balanced completed-turn prefix of a live session log: every event up to
 * and including the last `turn/end`. The in-flight turn is excluded (it cannot
 * be replayed as a valid child session); before any completed turn the child
 * starts fresh, so the caller omits the seed entirely. Mirrors the in-process
 * fork provider's slice semantics.
 * @param session - the session to slice.
 * @returns the seed events, contiguous from seq 0; empty when no turn has completed.
 */
export function collectForkSeed(session: Session): SessionEvent[] {
  const events = session.snapshotEvents()
  let lastEnd = -1
  for (let seq = 0; seq < events.length; seq++) {
    if (events[seq]?.type === 'turn/end') lastEnd = seq
  }
  return lastEnd >= 0 ? events.slice(0, lastEnd + 1) : []
}

/**
 * Short terminal-friendly relative time for a picker row.
 * @param epochMs - creation time, Unix epoch milliseconds.
 * @param now - reference time, injectable for tests.
 * @returns the relative-time label.
 */
export function formatWhen(epochMs: number, now = Date.now()): string {
  const diff = now - epochMs
  if (diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const date = new Date(epochMs)
  return `${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * Terminal-friendly tail of a workspace path for picker rows and the label.
 * @param cwd - absolute workspace path, or null when unrecorded.
 * @returns the last two path segments, or an empty string.
 */
export function shortCwd(cwd: string | null): string {
  if (cwd === null || cwd === '') return ''
  const parts = cwd.replaceAll('\\', '/').split('/').filter(Boolean)
  if (parts.length <= 2) return parts.join('/')
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

/**
 * Display label for the current session in the status bar.
 * @param summary - the session's title, id, and workspace.
 * @returns the label text.
 */
export function sessionLabel(summary: Pick<SessionSummary, 'title' | 'sessionId' | 'cwd'>): string {
  // The distinguishing part of an id follows the shared `session-` prefix;
  // truncating the prefixed form would render every row as `session-abc`.
  const raw = summary.sessionId.startsWith('session-')
    ? summary.sessionId.slice('session-'.length)
    : summary.sessionId
  const stem = summary.title ?? raw.slice(0, 12)
  const where = shortCwd(summary.cwd)
  return where === '' ? stem : `${stem} 路 ${where}`
}
