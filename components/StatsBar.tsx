import type { Ship } from '../pages/api/ships'

interface Props {
  ships: Ship[]
  lastFetch: string
  onRefresh: () => void
  loading: boolean
}

const TYPE_COLORS: Record<string, string> = {
  tanker:    '#f59e0b',
  container: '#3b82f6',
  bulk:      '#8b5cf6',
  cargo:     '#10b981',
  warship:   '#ef4444',
  tug:       '#6b7280',
}

export default function StatsBar({ ships, lastFetch, onRefresh, loading }: Props) {
  const counts: Record<string, number> = {}
  ships.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1 })

  const underway = ships.filter(s => s.status === 'underway').length
  const anchored  = ships.filter(s => s.status === 'anchored').length

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 text-xs">
      <div className="text-gray-400 font-semibold uppercase tracking-widest mr-2">
        Hormuz Strait Traffic
      </div>

      <div className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-300">{underway} underway</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
        <span className="text-gray-300">{anchored} anchored</span>
      </div>

      <div className="flex-1 flex flex-wrap gap-2">
        {Object.entries(counts).map(([type, n]) => (
          <span key={type} className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: (TYPE_COLORS[type] || '#6b7280') + '22',
                     color: TYPE_COLORS[type] || '#94a3b8',
                     border: `1px solid ${TYPE_COLORS[type] || '#6b7280'}44` }}>
            {n} {type}
          </span>
        ))}
      </div>

      <div className="text-gray-300 text-xs ml-auto font-mono">
        {lastFetch ? `⏱ ${new Date(lastFetch).toLocaleTimeString()}` : ''}
      </div>

      <button onClick={onRefresh} disabled={loading}
        className="px-3 py-1 rounded text-xs font-semibold transition-colors"
        style={{ backgroundColor: loading ? '#1f2937' : '#1d4ed8', color: loading ? '#6b7280' : '#fff' }}>
        {loading ? '⟳ Loading…' : '⟳ Refresh'}
      </button>
    </div>
  )
}
