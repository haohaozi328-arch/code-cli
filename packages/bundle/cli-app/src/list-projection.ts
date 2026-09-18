/**
 * The Session-list metadata projection (`sessionListMetadata`): the
 * blank/lastPromptAt fold the session picker reads from the projection
 * cache. The official registration lives in the web surface's
 * session-controller row; a terminal-only profile mounts no
 * session-controller, so this bundle registers the same unit itself — same
 * key, same state shape, same stateVersion — keeping checkpoint rows
 * compatible in both directions: rows written under the web surface load
 * here, and rows written here load under the web surface.
 * @module @dsh-external/dsh-cli-app/list-projection
 */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'

/** Persisted facts used to summarize a Session without activating it. */
export interface SessionListMetadata {
  /** Whether the folded prefix contains no turn. */
  readonly blank: boolean
  /** Latest human-authored prompt time in the folded prefix. */
  readonly lastPromptAt: number | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Host state persisted for cold Session list summaries. */
    sessionListMetadata: SessionListMetadata
  }
  interface SessionProjectionMap {
    /** Persisted facts used to summarize a Session without activating it. */
    sessionListMetadata: SessionListMetadata
  }
}

const sessionListMetadataSchema = z.object({
  blank: z.boolean(),
  lastPromptAt: z.number().nullable(),
})

/**
 * Advance the Session-list metadata projection by one committed event.
 * @param state - metadata before the event.
 * @param event - next committed Session event.
 * @returns the original or advanced metadata value.
 */
export function applySessionListMetadata(
  state: SessionListMetadata,
  event: SessionEvent,
): SessionListMetadata {
  const blank = state.blank && event.type !== 'turn/start'
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  return blank === state.blank && lastPromptAt === state.lastPromptAt
    ? state
    : { blank, lastPromptAt }
}

/**
 * Register the projection into the process registry. The registration is an
 * effect on the calling context's fiber, so it lives exactly as long as the
 * terminal app.
 * @param ctx - context carrying the session-projection registry service.
 */
export function registerSessionListProjection(ctx: Context): void {
  ctx.sessionProjections.register<'sessionListMetadata', SessionListMetadata>({
    key: 'sessionListMetadata',
    stateSchema: sessionListMetadataSchema,
    init: () => ({ blank: true, lastPromptAt: null }),
    apply: applySessionListMetadata,
    wire: { viewSchema: sessionListMetadataSchema, view: state => state },
    stateVersion: 1,
  })
}
