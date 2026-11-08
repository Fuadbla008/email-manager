/**
 * Completion means the user has finished with a credential, regardless of
 * whether the result was `done` or `error`. Only `pending` is incomplete.
 */
export function completionPct(done = 0, error = 0, total = 0) {
  if (!total || total <= 0) return 0
  const completed = Number(done) + Number(error)
  return Math.min(100, Math.round((completed / total) * 100))
}

export function completionWidths(done = 0, error = 0, total = 0) {
  if (!total || total <= 0) return { done: 0, error: 0 }
  const doneWidth = Math.min(100, (Number(done) / total) * 100)
  // Clamp the error segment to the space left so the bar never overflows.
  const errorWidth = Math.max(0, Math.min(100 - doneWidth, (Number(error) / total) * 100))
  return { done: doneWidth, error: errorWidth }
}
