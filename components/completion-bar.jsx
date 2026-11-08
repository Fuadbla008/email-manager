import { completionPct, completionWidths } from '@/lib/progress'

/**
 * Stacked completion bar: green = done, red = error, remaining grey = pending.
 * Done + error together are the completed portion, so 80 done/error out of 100
 * shows 80% complete with 20% left empty.
 */
export default function CompletionBar({
  done = 0,
  error = 0,
  total = 0,
  showLabel = true,
  className = '',
}) {
  const pct = completionPct(done, error, total)
  const widths = completionWidths(done, error, total)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden flex">
        <div className="h-2 bg-green-500" style={{ width: `${widths.done}%` }} />
        <div className="h-2 bg-red-500" style={{ width: `${widths.error}%` }} />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-500 whitespace-nowrap">{pct}%</span>
      )}
    </div>
  )
}
