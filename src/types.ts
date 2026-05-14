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
