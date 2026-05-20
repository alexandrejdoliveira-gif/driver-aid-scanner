export interface ScannedItem {
  id: string
  trackingId: string
  scannedAt: Date
  table: 'envelopes' | 'caixas'
  sessionId: string
}

export interface Session {
  id: string
  createdAt: Date
  envelopes: ScannedItem[]
  caixas: ScannedItem[]
  sentToFirebase: boolean
  sentAt?: Date
}

export interface FirebaseSession {
  sessionId: string
  createdAt: string
  envelopes: { trackingId: string; scannedAt: string }[]
  caixas: { trackingId: string; scannedAt: string }[]
  consolidated: { trackingId: string; table: string; scannedAt: string }[]
  totalPackages: number
}

// ── Amazon Flex extraction types ──

export interface DeliveryStop {
  id: string
  stopNumber: number
  stopCode: string
  address: string
  city: string
  deliveryInfo: string
  extractedAt: Date
  sessionId: string
}

export interface FirebaseFlexRoute {
  sessionId: string
  createdAt: unknown
  stops: {
    stopNumber: number
    stopCode: string
    address: string
    city: string
    deliveryInfo: string
    extractedAt: string
  }[]
  totalStops: number
}

export interface ExtractionLog {
  id: string
  msg: string
  type: 'info' | 'success' | 'warn' | 'error'
  ts: Date
}
