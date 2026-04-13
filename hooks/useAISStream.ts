import { useEffect, useRef, useCallback } from 'react'
import type { Ship, ShipType } from '../pages/api/ships'

// AIS type number → category (same mapping as server)
function aisTypeToCategory(t: number): ShipType {
  if (t >= 80 && t <= 89) return 'tanker'
  if (t >= 70 && t <= 79) return 'cargo'
  if (t >= 60 && t <= 69) return 'passenger'
  if (t >= 31 && t <= 32) return 'tug'
  if (t === 35 || t === 36 || t === 37) return 'warship'
  return 'other'
}

function navstatToStatus(n: number): Ship['status'] {
  if (n === 1) return 'anchored'
  if (n === 5) return 'moored'
  if (n === 3 || n === 4) return 'restricted'
  return 'underway'
}

function mmsiToFlag(mmsi: string): { flag: string; flagEmoji: string } {
  const mid = mmsi.slice(0, 3)
  const map: Record<string, [string, string]> = {
    '338': ['United States', '🇺🇸'], '232': ['United Kingdom', '🇬🇧'],
    '211': ['Germany', '🇩🇪'],       '229': ['Malta', '🇲🇹'],
    '311': ['Bahamas', '🇧🇸'],       '372': ['Panama', '🇵🇦'],
    '412': ['China', '🇨🇳'],         '413': ['China', '🇨🇳'],
    '431': ['Japan', '🇯🇵'],         '440': ['South Korea', '🇰🇷'],
    '477': ['Hong Kong', '🇭🇰'],     '525': ['Indonesia', '🇮🇩'],
    '533': ['Malaysia', '🇲🇾'],      '538': ['Marshall Islands', '🇲🇭'],
    '563': ['Singapore', '🇸🇬'],     '565': ['Singapore', '🇸🇬'],
    '636': ['Liberia', '🇱🇷'],       '470': ['UAE', '🇦🇪'],
    '471': ['UAE', '🇦🇪'],           '422': ['Iran', '🇮🇷'],
    '403': ['Saudi Arabia', '🇸🇦'],  '455': ['Oman', '🇴🇲'],
    '447': ['Kuwait', '🇰🇼'],        '408': ['Iraq', '🇮🇶'],
    '374': ['Panama', '🇵🇦'],        '566': ['Singapore', '🇸🇬'],
  }
  return map[mid] ? { flag: map[mid][0], flagEmoji: map[mid][1] } : { flag: 'Unknown', flagEmoji: '🏳️' }
}

type UpdateShipFn = (mmsi: string, patch: Partial<Ship> | ((prev: Ship) => Ship)) => void
type AddShipFn   = (ship: Ship) => void

interface Options {
  apiKey: string | undefined
  onUpdateShip: UpdateShipFn
  onAddShip: AddShipFn
  onStatusChange: (status: 'connecting' | 'live' | 'disconnected') => void
}

export function useAISStream({ apiKey, onUpdateShip, onAddShip, onStatusChange }: Options) {
  const wsRef        = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef   = useRef(true)
  const knownMMSIs   = useRef<Set<string>>(new Set())

  const addKnownMMSI = useCallback((mmsi: string) => { knownMMSIs.current.add(mmsi) }, [])

  const connect = useCallback(() => {
    if (!apiKey || !mountedRef.current) return
    if (wsRef.current) wsRef.current.close()

    onStatusChange('connecting')
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[24.0, 54.0], [27.5, 60.5]]],
        FilterMessageTypes: ['PositionReport'],
      }))
      onStatusChange('live')
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.MessageType !== 'PositionReport') return

        const pr   = msg.Message?.PositionReport
        const meta = msg.MetaData
        if (!pr || !meta) return

        const mmsi    = String(meta.MMSI ?? pr.UserID ?? '')
        const lat     = Number(meta.latitude  ?? pr.Latitude  ?? 0)
        const lng     = Number(meta.longitude ?? pr.Longitude ?? 0)
        if (!mmsi || lat === 0 || lng === 0) return

        const now = new Date().toISOString()

        if (knownMMSIs.current.has(mmsi)) {
          // Update existing ship position
          onUpdateShip(mmsi, {
            lat,
            lng,
            speed:      +(Number(pr.Sog ?? 0)).toFixed(1),
            course:     Number(pr.Cog ?? 0),
            heading:    Number(pr.TrueHeading ?? pr.Cog ?? 0),
            status:     navstatToStatus(Number(pr.NavigationalStatus ?? 0)),
            lastUpdate: now,
          })
        } else {
          // New vessel — add it
          knownMMSIs.current.add(mmsi)
          const { flag, flagEmoji } = mmsiToFlag(mmsi)
          const typeNum = Number(pr.Type ?? 0)
          onAddShip({
            mmsi,
            name:       String(meta.ShipName ?? 'Unknown').trim() || 'Unknown',
            type:       aisTypeToCategory(typeNum),
            flag,
            flagEmoji,
            lat,
            lng,
            speed:      +(Number(pr.Sog ?? 0)).toFixed(1),
            course:     Number(pr.Cog ?? 0),
            heading:    Number(pr.TrueHeading ?? pr.Cog ?? 0),
            destination: '—',
            origin:     '—',
            draught:    0,
            length:     0,
            dwt:        0,
            cargo:      typeNum >= 80 && typeNum <= 89 ? 'Tanker cargo' : '—',
            lastUpdate: now,
            status:     navstatToStatus(Number(pr.NavigationalStatus ?? 0)),
            imo:        '—',
            callsign:   '—',
          })
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => onStatusChange('disconnected')

    ws.onclose = () => {
      onStatusChange('disconnected')
      if (!mountedRef.current) return
      // Reconnect after 5s
      reconnectRef.current = setTimeout(connect, 5000)
    }
  }, [apiKey, onUpdateShip, onAddShip, onStatusChange])

  useEffect(() => {
    mountedRef.current = true
    if (apiKey) connect()
    return () => {
      mountedRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [apiKey, connect])

  return { addKnownMMSI }
}
