import { useEffect, useRef } from 'react'
import type { Ship } from '../pages/api/ships'
import type * as L_TYPE from 'leaflet'

const TYPE_COLORS: Record<string, string> = {
  tanker:    '#f59e0b',
  container: '#3b82f6',
  bulk:      '#8b5cf6',
  cargo:     '#10b981',
  warship:   '#ef4444',
  tug:       '#6b7280',
  passenger: '#ec4899',
}

function shipSVG(color: string, course: number, size: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
    style="transform:rotate(${course}deg);transform-origin:center;filter:drop-shadow(0 0 4px ${color}88);">
    <polygon points="12,2 18,20 12,16 6,20" fill="${color}" stroke="#000" stroke-width="1"/>
  </svg>`
}

interface Props {
  ships: Ship[]
  selectedMmsi: string | null
  onSelectShip: (ship: Ship) => void
}

export default function ShipMap({ ships, selectedMmsi, onSelectShip }: Props) {
  const mapRef = useRef<L_TYPE.Map | null>(null)
  const LRef = useRef<typeof L_TYPE | null>(null)
  const markersRef = useRef<Record<string, L_TYPE.Marker>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelectShip)
  const shipsRef = useRef(ships)
  const selectedRef = useRef(selectedMmsi)
  onSelectRef.current = onSelectShip
  shipsRef.current = ships
  selectedRef.current = selectedMmsi

  function syncMarkers(
    L: typeof L_TYPE,
    map: L_TYPE.Map,
    currentShips: Ship[],
    currentSelected: string | null
  ) {
    const seen = new Set<string>()

    currentShips.forEach(ship => {
      seen.add(ship.mmsi)
      const color = TYPE_COLORS[ship.type] || '#94a3b8'
      const isSelected = ship.mmsi === currentSelected
      const size = ship.type === 'warship' ? 22 : 18

      const icon = L.divIcon({
        className: '',
        html: shipSVG(isSelected ? '#fff' : color, ship.course, size),
        iconSize: [size, size] as L_TYPE.PointExpression,
        iconAnchor: [size / 2, size / 2] as L_TYPE.PointExpression,
      })

      if (markersRef.current[ship.mmsi]) {
        markersRef.current[ship.mmsi].setLatLng([ship.lat, ship.lng])
        markersRef.current[ship.mmsi].setIcon(icon)
      } else {
        const marker = L.marker([ship.lat, ship.lng], { icon })
          .addTo(map)
          .on('click', () => onSelectRef.current(ship))
        marker.bindTooltip(ship.name, {
          permanent: false,
          direction: 'top',
          offset: [0, -size / 2] as L_TYPE.PointExpression,
        })
        markersRef.current[ship.mmsi] = marker
      }
    })

    Object.keys(markersRef.current).forEach(mmsi => {
      if (!seen.has(mmsi)) {
        map.removeLayer(markersRef.current[mmsi])
        delete markersRef.current[mmsi]
      }
    })
  }

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    import('leaflet').then(L => {
      if (mapRef.current || !containerRef.current) return
      LRef.current = L

      const map = L.map(containerRef.current!, {
        center: [26.55, 56.50],
        zoom: 9,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      L.marker([26.58, 56.50] as L_TYPE.LatLngExpression, {
        icon: L.divIcon({
          className: '',
          html: `<div style="color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:2px;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px #000;">STRAIT OF HORMUZ</div>`,
          iconAnchor: [70, 0] as L_TYPE.PointExpression,
        }),
        interactive: false,
      }).addTo(map)

      mapRef.current = map
      // Render ships that may have arrived before Leaflet was ready
      syncMarkers(L, map, shipsRef.current, selectedRef.current)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync markers whenever ships or selection changes
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return
    syncMarkers(L, map, ships, selectedMmsi)
  }, [ships, selectedMmsi]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to selected ship
  useEffect(() => {
    if (!selectedMmsi || !mapRef.current) return
    const ship = ships.find(s => s.mmsi === selectedMmsi)
    if (ship) mapRef.current.panTo([ship.lat, ship.lng], { animate: true, duration: 0.5 } as any)
  }, [selectedMmsi, ships])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
