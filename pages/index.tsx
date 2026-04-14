import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import type { Ship } from './api/ships'
import ShipDetail from '../components/ShipDetail'
import StatsBar from '../components/StatsBar'
import { useAISStream } from '../hooks/useAISStream'

const ShipMap = dynamic(() => import('../components/ShipMap'), { ssr: false })

const TYPE_COLORS: Record<string, string> = {
  tanker:    '#f59e0b',
  container: '#3b82f6',
  bulk:      '#8b5cf6',
  cargo:     '#10b981',
  warship:   '#ef4444',
  tug:       '#6b7280',
  passenger: '#ec4899',
}

type StreamStatus = 'off' | 'connecting' | 'live' | 'disconnected'

const STATUS_DOT: Record<StreamStatus, string> = {
  off:          'bg-gray-600',
  connecting:   'bg-yellow-400 animate-pulse',
  live:         'bg-green-400 animate-pulse',
  disconnected: 'bg-red-500 animate-pulse',
}
const STATUS_LABEL: Record<StreamStatus, string> = {
  off:          'POLLING',
  connecting:   'CONNECTING…',
  live:         'LIVE',
  disconnected: 'RECONNECTING…',
}

const aisstreamKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY

export default function Home() {
  const [ships, setShips]               = useState<Ship[]>([])
  const [selected, setSelected]         = useState<Ship | null>(null)
  const [lastFetch, setLastFetch]       = useState('')
  const [loading, setLoading]           = useState(false)
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('off')
  const [vesselCount, setVesselCount]   = useState(0) // real vessels seen via stream
  const intervalRef   = useRef<NodeJS.Timeout | null>(null)
  const shipsMapRef   = useRef<Map<string, Ship>>(new Map())
  const usingStream   = !!aisstreamKey

  const fetchShips = useCallback(async () => {
    // If AISStream is configured, skip mock data — map starts empty and fills from WebSocket
    if (usingStream) return
    setLoading(true)
    try {
      const res  = await fetch('/api/ships')
      const data = await res.json()
      const newShips: Ship[] = data.ships
      newShips.forEach(s => { if (!shipsMapRef.current.has(s.mmsi)) shipsMapRef.current.set(s.mmsi, s) })
      setShips(Array.from(shipsMapRef.current.values()))
      setLastFetch(data.meta.fetchedAt)
    } finally {
      setLoading(false)
    }
  }, [usingStream])

  useEffect(() => {
    fetchShips()
    intervalRef.current = setInterval(fetchShips, 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchShips])

  const handleUpdateShip = useCallback((mmsi: string, patch: Partial<Ship>) => {
    const prev = shipsMapRef.current.get(mmsi)
    if (prev) shipsMapRef.current.set(mmsi, { ...prev, ...patch })
    setShips(Array.from(shipsMapRef.current.values()))
    setSelected(s => s?.mmsi === mmsi ? { ...s, ...patch } : s)
  }, [])

  const handleAddShip = useCallback((ship: Ship) => {
    shipsMapRef.current.set(ship.mmsi, ship)
    setShips(Array.from(shipsMapRef.current.values()))
    setVesselCount(c => c + 1)
    setLastFetch(new Date().toISOString())
  }, [])

  const handleStreamStatus = useCallback((s: StreamStatus) => setStreamStatus(s), [])

  const { addKnownMMSI } = useAISStream({
    apiKey:         aisstreamKey,
    onUpdateShip:   handleUpdateShip,
    onAddShip:      handleAddShip,
    onStatusChange: handleStreamStatus,
  })

  useEffect(() => { ships.forEach(s => addKnownMMSI(s.mmsi)) }, [ships, addKnownMMSI])

  const handleSelectShip = useCallback((ship: Ship) => setSelected(ship), [])

  const isLive    = streamStatus === 'live'
  const isEmpty   = ships.length === 0

  return (
    <>
      <Head>
        <title>Hormuz Strait — AIS Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-bold tracking-widest text-gray-100 uppercase">
            Strait of Hormuz — AIS Tracker
          </span>
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold
            ${isLive                        ? 'bg-green-900 text-green-300' :
              streamStatus === 'connecting'  ? 'bg-yellow-900 text-yellow-300' :
              streamStatus === 'disconnected'? 'bg-red-900 text-red-300' :
                                              'bg-gray-800 text-gray-500'}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[streamStatus]}`} />
            {STATUS_LABEL[streamStatus]}
          </span>
        </div>

        {/* Data source banner */}
        <div className={`flex items-center gap-2 px-4 py-1.5 text-xs border-b border-gray-800
          ${isLive ? 'bg-green-950 text-green-300' : 'bg-yellow-950 text-yellow-300'}`}>
          <span className="font-bold">{isLive ? '🟢 LIVE DATA' : '🟡 MOCK DATA'}</span>
          <span className="opacity-75">
            {isLive
              ? `— AISStream.io WebSocket · ${ships.length} real vessel${ships.length !== 1 ? 's' : ''} in area`
              : '— No AISStream key · showing simulated vessels'}
          </span>
        </div>

        <StatsBar ships={ships} lastFetch={lastFetch} onRefresh={fetchShips} loading={loading} />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-700 overflow-y-auto hidden md:flex flex-col">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-700">
              Vessels ({ships.length})
            </div>
            {ships.map(ship => (
              <button key={ship.mmsi} onClick={() => handleSelectShip(ship)}
                className={`flex flex-col px-3 py-2 text-left border-b border-gray-800 transition-colors hover:bg-gray-800
                  ${selected?.mmsi === ship.mmsi ? 'bg-gray-800' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[ship.type] || '#6b7280' }} />
                  <span className="text-xs font-semibold text-white truncate">{ship.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-4">
                  <span className="text-gray-500 text-xs">{ship.flagEmoji}</span>
                  <span className="text-gray-500 text-xs truncate">{ship.destination}</span>
                  <span className="ml-auto text-gray-400 text-xs flex-shrink-0">{ship.speed} kn</span>
                </div>
              </button>
            ))}
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            <ShipMap ships={ships} selectedMmsi={selected?.mmsi ?? null} onSelectShip={handleSelectShip} />

            {/* Waiting overlay — shown until first real vessel arrives */}
            {usingStream && isEmpty && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-[400] pointer-events-none">
                <div className="bg-gray-900 bg-opacity-90 border border-gray-700 rounded-xl px-8 py-6 text-center">
                  <div className="text-2xl mb-2">📡</div>
                  <div className="text-white font-semibold mb-1">
                    {streamStatus === 'connecting' ? 'Connecting to AISStream…' : 'Waiting for vessels…'}
                  </div>
                  <div className="text-gray-400 text-xs">
                    Listening on Strait of Hormuz · 24–27.5°N 54–60.5°E
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-90 rounded-lg p-3 text-xs border border-gray-700 z-[500]">
              <div className="text-gray-400 font-semibold mb-2 uppercase tracking-wider">Legend</div>
              {Object.entries({ Tanker:'#f59e0b', Container:'#3b82f6', Bulk:'#8b5cf6', Cargo:'#10b981', Naval:'#ef4444', Tug:'#6b7280' })
                .map(([label, color]) => (
                  <div key={label} className="flex items-center gap-2 mb-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-gray-300">{label}</span>
                  </div>
              ))}
            </div>
          </div>

          {selected && (
            <div className="w-72 flex-shrink-0 border-l border-gray-700">
              <ShipDetail ship={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
