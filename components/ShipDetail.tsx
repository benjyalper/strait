import type { Ship } from '../pages/api/ships'

const TYPE_COLORS: Record<string, string> = {
  tanker:    '#f59e0b',
  container: '#3b82f6',
  bulk:      '#8b5cf6',
  cargo:     '#10b981',
  warship:   '#ef4444',
  tug:       '#6b7280',
  passenger: '#ec4899',
}

const TYPE_LABELS: Record<string, string> = {
  tanker:    'OIL TANKER',
  container: 'CONTAINER',
  bulk:      'BULK CARRIER',
  cargo:     'GENERAL CARGO',
  warship:   'NAVAL VESSEL',
  tug:       'TUG',
  passenger: 'PASSENGER',
}

const STATUS_COLORS: Record<string, string> = {
  underway:   '#10b981',
  anchored:   '#f59e0b',
  moored:     '#6b7280',
  restricted: '#ef4444',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 60000)
  if (diff < 1) return 'Just now'
  if (diff < 60) return `${diff}m ago`
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`
}

function compassDir(deg: number) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

interface Props {
  ship: Ship
  onClose: () => void
}

export default function ShipDetail({ ship, onClose }: Props) {
  const color = TYPE_COLORS[ship.type] || '#94a3b8'

  return (
    <div className="flex flex-col h-full bg-gray-900 text-sm overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-700"
           style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
        <div>
          <div className="text-xs font-bold tracking-widest mb-1" style={{ color }}>
            {TYPE_LABELS[ship.type] || ship.type.toUpperCase()}
          </div>
          <div className="text-lg font-bold text-white leading-tight">{ship.name}</div>
          <div className="text-gray-400 mt-1">
            {ship.flagEmoji} {ship.flag} &nbsp;·&nbsp; IMO {ship.imo} &nbsp;·&nbsp; {ship.callsign}
          </div>
        </div>
        <button onClick={onClose}
          className="text-gray-500 hover:text-white text-xl leading-none mt-1 ml-2">×</button>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[ship.status] || '#6b7280' }} />
        <span className="text-xs uppercase font-semibold text-gray-300">{ship.status}</span>
        <span className="text-gray-500">|</span>
        <span className="text-xs text-gray-400">Updated {formatTime(ship.lastUpdate)}</span>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-3 gap-px bg-gray-700 border-b border-gray-700">
        {[
          { label: 'SPEED', value: `${ship.speed} kn` },
          { label: 'COURSE', value: `${ship.course}° ${compassDir(ship.course)}` },
          { label: 'HEADING', value: `${ship.heading}°` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 px-3 py-3 text-center">
            <div className="text-gray-500 text-xs mb-1">{label}</div>
            <div className="text-white font-mono font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {/* Route */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-gray-500 text-xs w-16">FROM</div>
          <div className="text-white font-semibold">{ship.origin}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-gray-500 text-xs w-16">TO</div>
          <div className="text-white font-semibold">{ship.destination}</div>
        </div>
      </div>

      {/* Position */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="text-gray-500 text-xs mb-2">POSITION</div>
        <div className="font-mono text-white">
          {ship.lat.toFixed(4)}°N &nbsp; {ship.lng.toFixed(4)}°E
        </div>
      </div>

      {/* Vessel info */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="text-gray-500 text-xs mb-2">VESSEL</div>
        <div className="grid grid-cols-2 gap-y-2">
          {[
            { label: 'Length', value: `${ship.length} m` },
            { label: 'Draught', value: `${ship.draught} m` },
            ...(ship.dwt > 0 ? [{ label: 'DWT', value: `${ship.dwt.toLocaleString()} t` }] : []),
            { label: 'Cargo', value: ship.cargo },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-gray-500 text-xs">{label}</div>
              <div className="text-gray-200">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MMSI */}
      <div className="px-4 py-3">
        <div className="text-gray-500 text-xs mb-1">MMSI</div>
        <div className="font-mono text-gray-300">{ship.mmsi}</div>
      </div>
    </div>
  )
}
