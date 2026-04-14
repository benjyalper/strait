import type { NextApiRequest, NextApiResponse } from 'next'

export type ShipType = 'tanker' | 'container' | 'bulk' | 'cargo' | 'warship' | 'tug' | 'passenger' | 'fishing' | 'other'

export interface Ship {
  mmsi: string
  name: string
  type: ShipType
  flag: string
  flagEmoji: string
  lat: number
  lng: number
  speed: number
  course: number
  heading: number
  destination: string
  origin: string
  draught: number
  length: number
  dwt: number
  cargo: string
  lastUpdate: string
  status: 'underway' | 'anchored' | 'moored' | 'restricted'
  imo: string
  callsign: string
}

// AIS type number → our category
function aisTypeToCategory(t: number): ShipType {
  if (t >= 80 && t <= 89) return 'tanker'
  if (t >= 70 && t <= 79) return 'cargo'
  if (t >= 60 && t <= 69) return 'passenger'
  if (t >= 30 && t <= 32) return 'tug'
  if (t === 35 || t === 36 || t === 37) return 'warship'
  if (t === 30) return 'fishing'
  if (t >= 40 && t <= 49) return 'other' // high-speed craft
  if (t >= 20 && t <= 29) return 'other' // WIG
  return 'other'
}

// NAVSTAT → our status
function navstatToStatus(n: number): Ship['status'] {
  if (n === 1) return 'anchored'
  if (n === 5) return 'moored'
  if (n === 3 || n === 4) return 'restricted'
  return 'underway'
}

// Rough MMSI country prefix → flag
function mmsiToFlag(mmsi: string): { flag: string; flagEmoji: string } {
  const mid = mmsi.slice(0, 3)
  const map: Record<string, [string, string]> = {
    '338': ['United States', '🇺🇸'], '316': ['Canada', '🇨🇦'],
    '232': ['United Kingdom', '🇬🇧'], '211': ['Germany', '🇩🇪'],
    '229': ['Malta', '🇲🇹'],         '249': ['Malta', '🇲🇹'],
    '247': ['Italy', '🇮🇹'],         '227': ['France', '🇫🇷'],
    '244': ['Netherlands', '🇳🇱'],   '248': ['Malta', '🇲🇹'],
    '311': ['Bahamas', '🇧🇸'],       '319': ['Cayman Islands', '🇰🇾'],
    '372': ['Panama', '🇵🇦'],        '370': ['Panama', '🇵🇦'],
    '374': ['Panama', '🇵🇦'],        '376': ['Panama', '🇵🇦'],
    '412': ['China', '🇨🇳'],         '413': ['China', '🇨🇳'],
    '416': ['Taiwan', '🇹🇼'],        '431': ['Japan', '🇯🇵'],
    '432': ['Japan', '🇯🇵'],         '440': ['South Korea', '🇰🇷'],
    '477': ['Hong Kong', '🇭🇰'],     '525': ['Indonesia', '🇮🇩'],
    '533': ['Malaysia', '🇲🇾'],      '538': ['Marshall Islands', '🇲🇭'],
    '548': ['Philippines', '🇵🇭'],   '563': ['Singapore', '🇸🇬'],
    '565': ['Singapore', '🇸🇬'],     '566': ['Singapore', '🇸🇬'],
    '574': ['Vietnam', '🇻🇳'],       '636': ['Liberia', '🇱🇷'],
    '657': ['Tanzania', '🇹🇿'],      '667': ['Sierra Leone', '🇸🇱'],
    '710': ['Brazil', '🇧🇷'],        '725': ['Chile', '🇨🇱'],
    '470': ['UAE', '🇦🇪'],           '471': ['UAE', '🇦🇪'],
    '422': ['Iran', '🇮🇷'],          '403': ['Saudi Arabia', '🇸🇦'],
    '455': ['Oman', '🇴🇲'],          '447': ['Kuwait', '🇰🇼'],
    '408': ['Iraq', '🇮🇶'],
  }
  return map[mid] ? { flag: map[mid][0], flagEmoji: map[mid][1] } : { flag: 'Unknown', flagEmoji: '🏳️' }
}

// ── AISHub live fetch ────────────────────────────────────────────────────────
async function fetchAISHub(username: string): Promise<Ship[]> {
  // Hormuz bounding box
  const params = new URLSearchParams({
    username,
    format: '1',
    output: 'json',
    compress: '0',
    latmin: '24.0',
    latmax: '27.5',
    lonmin: '54.0',
    lonmax: '60.5',
  })

  const res = await fetch(`https://data.aishub.net/ws.php?${params}`, {
    headers: { 'User-Agent': 'hormuz-tracker/1.0' },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`AISHub HTTP ${res.status}`)

  // AISHub returns [ {metadata}, [vessels...] ]
  const json = await res.json()
  if (!Array.isArray(json) || json.length < 2) throw new Error('Unexpected AISHub response shape')

  const vessels: any[] = json[1]
  if (!Array.isArray(vessels)) throw new Error('No vessel array in AISHub response')

  return vessels.map((v): Ship => {
    const mmsi = String(v.MMSI ?? '')
    const { flag, flagEmoji } = mmsiToFlag(mmsi)
    const typeNum = Number(v.TYPE ?? 0)
    const dimA = Number(v.A ?? 0)
    const dimB = Number(v.B ?? 0)
    const length = dimA + dimB || 0

    return {
      mmsi,
      name: String(v.NAME ?? 'Unknown').trim() || 'Unknown',
      type: aisTypeToCategory(typeNum),
      flag,
      flagEmoji,
      lat: Number(v.LATITUDE ?? 0),
      lng: Number(v.LONGITUDE ?? 0),
      speed: Number(v.SOG ?? 0),
      course: Number(v.COG ?? 0),
      heading: Number(v.HEADING ?? v.COG ?? 0),
      destination: String(v.DEST ?? '').trim() || '—',
      origin: '—',
      draught: Number(v.DRAUGHT ?? 0),
      length,
      dwt: 0,
      cargo: typeNum >= 80 && typeNum <= 89 ? 'Tanker cargo' : '—',
      lastUpdate: v.TIME ? new Date(v.TIME * 1000).toISOString() : new Date().toISOString(),
      status: navstatToStatus(Number(v.NAVSTAT ?? 0)),
      imo: String(v.IMO ?? '—'),
      callsign: String(v.CALLSIGN ?? '—').trim() || '—',
    }
  }).filter(s => s.lat !== 0 && s.lng !== 0) // drop vessels with no position
}

// ── VesselFinder live fetch ──────────────────────────────────────────────────
// VesselFinder requires MMSI/IMO — no bounding-box search.
// We query a set of well-known Hormuz corridor vessels (VLCC tankers, major
// container lines, regional operators) that regularly transit the strait.
const HORMUZ_MMSI_LIST = [
  // VLCC / suezmax tankers (UAE/Saudi export routes)
  477308800, 477543600, 563073000, 477547200, 477337500,
  636019088, 636016875, 538005765, 538006297, 538005987,
  311000221, 311000371, 311000439, 372855000, 372044000,
  // LNG carriers (Qatar / UAE)
  538004086, 538004175, 477543900, 477544100, 563038200,
  // Container (Jebel Ali calls)
  477476000, 477285700, 566963000, 636021504, 218458000,
  // Bulk / general (Bandar Abbas, Khor Fakkan)
  374056000, 374217000, 412387260, 412426080, 525011121,
  // Regional / UAE coastal
  470476000, 470497000, 471008500, 455002450, 403000094,
  // Iranian NITC tankers
  422012300, 422016100, 422071600, 422071700, 422071800,
].join(',')

function mapVesselFinderVessel(entry: any): Ship | null {
  const v = entry.AIS
  if (!v) return null
  const mmsi = String(v.MMSI ?? '')
  if (!mmsi) return null
  const { flag, flagEmoji } = mmsiToFlag(mmsi)
  const typeNum = Number(v.TYPE ?? 0)

  return {
    mmsi,
    name: String(v.NAME ?? 'Unknown').trim() || 'Unknown',
    type: aisTypeToCategory(typeNum),
    flag,
    flagEmoji,
    lat: Number(v.LATITUDE ?? 0),
    lng: Number(v.LONGITUDE ?? 0),
    speed: Number(v.SPEED ?? 0),
    course: Number(v.COURSE ?? 0),
    heading: Number(v.HEADING ?? v.COURSE ?? 0),
    destination: String(v.DESTINATION ?? '').trim() || '—',
    origin: '—',
    draught: Number(v.DRAUGHT ?? 0),
    length: 0,
    dwt: 0,
    cargo: typeNum >= 80 && typeNum <= 89 ? 'Tanker cargo' : '—',
    lastUpdate: v.TIMESTAMP
      ? new Date(v.TIMESTAMP.replace(' UTC', 'Z')).toISOString()
      : new Date().toISOString(),
    status: navstatToStatus(Number(v.NAVSTAT ?? 0)),
    imo: String(v.IMO ?? '—'),
    callsign: String(v.CALLSIGN ?? '—').trim() || '—',
  }
}

async function fetchVesselFinder(apiKey: string): Promise<Ship[]> {
  const url = `https://api.vesselfinder.com/vessels?userkey=${apiKey}&mmsi=${HORMUZ_MMSI_LIST}&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`VesselFinder HTTP ${res.status}`)
  const json: any[] = await res.json()
  if (!Array.isArray(json)) throw new Error('Unexpected VesselFinder response')

  // Filter to vessels actually in the Hormuz bounding box right now
  return json
    .map(mapVesselFinderVessel)
    .filter((s): s is Ship => s !== null && s.lat >= 24.0 && s.lat <= 27.5 && s.lng >= 54.0 && s.lng <= 60.5)
}

// ── Mock fallback (used when neither key is set) ─────────────────────────────
function NOW() { return new Date() }
function minsAgo(n: number) { return new Date(NOW().getTime() - n * 60000).toISOString() }

const MOCK_SHIPS: Ship[] = [
  { mmsi: '477123450', name: 'PACIFIC JEWEL',        type: 'tanker',    flag: 'Hong Kong',       flagEmoji: '🇭🇰', lat: 26.62, lng: 56.48, speed: 13.2, course: 295, heading: 293, destination: 'ROTTERDAM',     origin: 'FUJAIRAH',     draught: 18.4, length: 333, dwt: 298000, cargo: 'Crude Oil',     lastUpdate: minsAgo(3),  status: 'underway', imo: '9467123', callsign: 'VRPJ3'  },
  { mmsi: '372045610', name: 'ATLANTIC NAVIGATOR',   type: 'tanker',    flag: 'Panama',          flagEmoji: '🇵🇦', lat: 26.54, lng: 56.71, speed: 12.8, course: 288, heading: 290, destination: 'HOUSTON',       origin: 'ABU DHABI',    draught: 17.9, length: 320, dwt: 265000, cargo: 'Crude Oil',     lastUpdate: minsAgo(7),  status: 'underway', imo: '9512874', callsign: 'HP3421' },
  { mmsi: '636015800', name: 'SEAGULF AURORA',       type: 'tanker',    flag: 'Liberia',         flagEmoji: '🇱🇷', lat: 26.71, lng: 56.25, speed: 11.5, course: 112, heading: 115, destination: 'FUJAIRAH',      origin: 'ROTTERDAM',    draught: 8.2,  length: 274, dwt: 158000, cargo: 'Ballast',       lastUpdate: minsAgo(2),  status: 'underway', imo: '9345678', callsign: 'A8KM4'  },
  { mmsi: '565012340', name: 'ORIENTAL PEARL',       type: 'tanker',    flag: 'Singapore',       flagEmoji: '🇸🇬', lat: 26.44, lng: 57.02, speed: 14.1, course: 70,  heading: 72,  destination: 'NINGBO',        origin: 'KHARG ISLAND', draught: 19.1, length: 330, dwt: 310000, cargo: 'Crude Oil',     lastUpdate: minsAgo(5),  status: 'underway', imo: '9601234', callsign: '9V8BX'  },
  { mmsi: '229874000', name: 'MEDITERRANEAN SEA',    type: 'tanker',    flag: 'Malta',           flagEmoji: '🇲🇹', lat: 26.85, lng: 55.98, speed: 0.3,  course: 0,   heading: 245, destination: 'BANDAR IMAM',   origin: 'TRIESTE',      draught: 9.0,  length: 243, dwt: 105000, cargo: 'Gasoline',      lastUpdate: minsAgo(18), status: 'anchored', imo: '9234567', callsign: '9H4TK'  },
  { mmsi: '538006700', name: 'MARSHAL ISLANDS GLORY',type: 'tanker',    flag: 'Marshall Islands',flagEmoji: '🇲🇭', lat: 26.38, lng: 57.31, speed: 12.0, course: 95,  heading: 97,  destination: 'YOKOHAMA',      origin: 'KHOR FAKKAN',  draught: 16.5, length: 295, dwt: 210000, cargo: 'LNG',           lastUpdate: minsAgo(11), status: 'underway', imo: '9712345', callsign: 'V7AB9'  },
  { mmsi: '311000450', name: 'BAHAMAS SPIRIT',       type: 'tanker',    flag: 'Bahamas',         flagEmoji: '🇧🇸', lat: 26.58, lng: 56.88, speed: 13.5, course: 285, heading: 282, destination: 'CORPUS CHRISTI',origin: 'DAS ISLAND',   draught: 18.8, length: 340, dwt: 320000, cargo: 'Crude Oil',     lastUpdate: minsAgo(4),  status: 'underway', imo: '9823456', callsign: 'C6AA1'  },
  { mmsi: '249123800', name: 'MARE NOSTRUM',         type: 'tanker',    flag: 'Malta',           flagEmoji: '🇲🇹', lat: 26.76, lng: 56.55, speed: 0.1,  course: 0,   heading: 180, destination: 'BANDAR ABBAS',  origin: 'KARACHI',      draught: 7.5,  length: 183, dwt: 47000,  cargo: 'Naphtha',       lastUpdate: minsAgo(33), status: 'anchored', imo: '9456789', callsign: '9H5MN'  },
  { mmsi: '477891230', name: 'COSCO HARMONY',        type: 'container', flag: 'Hong Kong',       flagEmoji: '🇭🇰', lat: 26.50, lng: 56.62, speed: 16.2, course: 278, heading: 275, destination: 'HAMBURG',       origin: 'JEBEL ALI',    draught: 13.2, length: 366, dwt: 154000, cargo: 'Containers',    lastUpdate: minsAgo(6),  status: 'underway', imo: '9701234', callsign: 'VRPK5'  },
  { mmsi: '218456000', name: 'MAERSK STRALSUND',     type: 'container', flag: 'Germany',         flagEmoji: '🇩🇪', lat: 26.48, lng: 56.95, speed: 17.8, course: 83,  heading: 85,  destination: 'JEBEL ALI',     origin: 'PORT SAID',    draught: 12.8, length: 347, dwt: 128000, cargo: 'Containers',    lastUpdate: minsAgo(9),  status: 'underway', imo: '9567890', callsign: 'DABC1'  },
  { mmsi: '566234500', name: 'MSC DUBAI EXPRESS',    type: 'container', flag: 'Singapore',       flagEmoji: '🇸🇬', lat: 26.67, lng: 56.38, speed: 15.4, course: 293, heading: 291, destination: 'BARCELONA',     origin: 'COLOMBO',      draught: 14.1, length: 399, dwt: 197000, cargo: 'Containers',    lastUpdate: minsAgo(2),  status: 'underway', imo: '9634512', callsign: '9V7CC'  },
  { mmsi: '374056000', name: 'IRON SEA DRAGON',      type: 'bulk',      flag: 'Panama',          flagEmoji: '🇵🇦', lat: 26.42, lng: 57.15, speed: 10.5, course: 88,  heading: 90,  destination: 'BANDAR IMAM',   origin: 'PORT HEDLAND', draught: 14.5, length: 228, dwt: 87000,  cargo: 'Iron Ore',      lastUpdate: minsAgo(14), status: 'underway', imo: '9389012', callsign: 'HP7812' },
  { mmsi: '636091200', name: 'LIBERIA GRAIN',        type: 'bulk',      flag: 'Liberia',         flagEmoji: '🇱🇷', lat: 26.80, lng: 56.12, speed: 9.8,  course: 105, heading: 108, destination: 'BANDAR ABBAS',  origin: 'ODESSA',       draught: 11.2, length: 190, dwt: 55000,  cargo: 'Wheat',         lastUpdate: minsAgo(21), status: 'underway', imo: '9445678', callsign: 'A8LM6'  },
  { mmsi: '412345670', name: 'CHINA PROGRESS',       type: 'cargo',     flag: 'China',           flagEmoji: '🇨🇳', lat: 26.55, lng: 56.78, speed: 11.2, course: 90,  heading: 92,  destination: 'TIANJIN',       origin: 'JEBEL ALI',    draught: 8.6,  length: 185, dwt: 28000,  cargo: 'General Cargo', lastUpdate: minsAgo(8),  status: 'underway', imo: '9512093', callsign: 'BSAV3'  },
  { mmsi: '338000001', name: 'USS PAUL HAMILTON',    type: 'warship',   flag: 'United States',   flagEmoji: '🇺🇸', lat: 26.60, lng: 56.55, speed: 18.0, course: 260, heading: 258, destination: 'BAHRAIN',       origin: '5TH FLEET AOR',draught: 6.3,  length: 154, dwt: 0,      cargo: 'N/A',           lastUpdate: minsAgo(1),  status: 'underway', imo: 'N/A',     callsign: 'NAVYUS1'},
  { mmsi: '470000001', name: 'UAE PATROL 7',         type: 'warship',   flag: 'UAE',             flagEmoji: '🇦🇪', lat: 26.88, lng: 56.20, speed: 22.5, course: 315, heading: 315, destination: 'ABU DHABI',     origin: 'PATROL',       draught: 2.8,  length: 63,  dwt: 0,      cargo: 'N/A',           lastUpdate: minsAgo(1),  status: 'underway', imo: 'N/A',     callsign: 'UAEPAT7'},
  { mmsi: '470123400', name: 'GULF TUG HAMAD',       type: 'tug',       flag: 'UAE',             flagEmoji: '🇦🇪', lat: 26.82, lng: 56.32, speed: 5.2,  course: 200, heading: 198, destination: 'KHASAB',        origin: 'SHARJAH',      draught: 4.1,  length: 42,  dwt: 0,      cargo: 'Towing',        lastUpdate: minsAgo(15), status: 'underway', imo: '9234891', callsign: 'A6TG4'  },
]

function getMockShips(): Ship[] {
  return MOCK_SHIPS.map(s => ({
    ...s,
    lat: s.status === 'underway' ? +(s.lat + (Math.random() - 0.5) * 0.01).toFixed(5) : s.lat,
    lng: s.status === 'underway' ? +(s.lng + (Math.random() - 0.5) * 0.01).toFixed(5) : s.lng,
    speed: s.status === 'underway' ? +(s.speed + (Math.random() - 0.5) * 0.4).toFixed(1) : s.speed,
    lastUpdate: minsAgo(Math.floor(Math.random() * 5)),
  }))
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const aishubUser   = process.env.AISHUB_USERNAME
  const vfKey        = process.env.VESSELFINDER_API_KEY
  res.setHeader('Cache-Control', 'no-cache')

  // 1. Try AISHub (bounding-box — best for area tracking)
  if (aishubUser) {
    try {
      const ships = await fetchAISHub(aishubUser)
      return res.status(200).json({
        ships,
        meta: { fetchedAt: new Date().toISOString(), source: `AISHub live data (${ships.length} vessels)`, area: 'Strait of Hormuz', totalVessels: ships.length, live: true },
      })
    } catch (err: any) {
      console.error('AISHub error:', err.message)
    }
  }

  // 2. Try VesselFinder (MMSI-list query)
  if (vfKey) {
    try {
      const ships = await fetchVesselFinder(vfKey)
      return res.status(200).json({
        ships,
        meta: { fetchedAt: new Date().toISOString(), source: `VesselFinder live data (${ships.length} vessels in area)`, area: 'Strait of Hormuz', totalVessels: ships.length, live: true },
      })
    } catch (err: any) {
      console.error('VesselFinder error:', err.message)
    }
  }

  // 3. Mock fallback
  const ships = getMockShips()
  const hint = !aishubUser && !vfKey
    ? 'Mock data — set AISHUB_USERNAME or VESSELFINDER_API_KEY in .env.local'
    : 'Live API error — showing mock data'
  return res.status(200).json({
    ships,
    meta: { fetchedAt: new Date().toISOString(), source: hint, area: 'Strait of Hormuz', totalVessels: ships.length, live: false },
  })
}
