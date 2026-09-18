/**
 * Render a thrown value as one diagnostic line for the error banner.
 * @param error - the caught value.
 * @returns its message, or its string form for non-Error throws.
 */
export function renderError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
