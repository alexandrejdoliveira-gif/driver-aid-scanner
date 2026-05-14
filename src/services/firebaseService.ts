import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import type { ScannedItem, FirebaseSession } from '../types'

export async function sendSessionToFirebase(
  sessionId: string,
  envelopes: ScannedItem[],
  caixas: ScannedItem[]
): Promise<string> {
  const consolidated = [
    ...envelopes.map((e) => ({ trackingId: e.trackingId, table: 'Envelopes', scannedAt: e.scannedAt.toISOString() })),
    ...caixas.map((c) => ({ trackingId: c.trackingId, table: 'Caixas', scannedAt: c.scannedAt.toISOString() })),
  ]

  const payload: Omit<FirebaseSession, 'sessionId'> & { createdAt: unknown; sessionId: string } = {
    sessionId,
    createdAt: serverTimestamp(),
    envelopes: envelopes.map((e) => ({ trackingId: e.trackingId, scannedAt: e.scannedAt.toISOString() })),
    caixas: caixas.map((c) => ({ trackingId: c.trackingId, scannedAt: c.scannedAt.toISOString() })),
    consolidated,
    totalPackages: envelopes.length + caixas.length,
  }

  const docRef = await addDoc(collection(db, 'sessions'), payload)
  return docRef.id
}
