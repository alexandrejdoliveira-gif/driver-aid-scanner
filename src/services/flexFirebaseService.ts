import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import type { DeliveryStop, FirebaseFlexRoute } from '../types'

const MAX_RETRIES = 4
const BASE_DELAY_MS = 1000

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Send an extracted Amazon Flex route to Firestore.
 * Retries up to MAX_RETRIES times with exponential backoff.
 * Returns the Firestore document ID on success.
 */
export async function sendFlexRouteToFirebase(
  sessionId: string,
  stops: DeliveryStop[]
): Promise<string> {
  if (stops.length === 0) throw new Error('Nenhuma parada para enviar')

  const sorted = [...stops].sort((a, b) => a.stopNumber - b.stopNumber)

  const payload: Omit<FirebaseFlexRoute, 'createdAt'> & { createdAt: unknown } = {
    sessionId,
    createdAt: serverTimestamp(),
    stops: sorted.map((s) => ({
      stopNumber: s.stopNumber,
      stopCode: s.stopCode,
      address: s.address,
      city: s.city,
      deliveryInfo: s.deliveryInfo,
      extractedAt: s.extractedAt.toISOString(),
    })),
    totalStops: stops.length,
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const docRef = await addDoc(collection(db, 'flex_routes'), payload)
      return docRef.id
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await sleep(delay)
      }
    }
  }

  throw lastError
}
