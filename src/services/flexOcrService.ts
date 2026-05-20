import Tesseract from 'tesseract.js'
import type { DeliveryStop } from '../types'

type TesseractWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

let flexWorker: TesseractWorker | null = null
let flexWorkerInitializing = false

export async function getFlexOCRWorker(): Promise<TesseractWorker> {
  if (flexWorker) return flexWorker
  if (flexWorkerInitializing) {
    while (flexWorkerInitializing) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return flexWorker!
  }

  flexWorkerInitializing = true
  try {
    flexWorker = await Tesseract.createWorker('eng', 1, {
      logger: () => {},
    })
    await flexWorker.setParameters({
      tessedit_pageseg_mode: '6' as never, // single uniform block — good for list items
    })
    return flexWorker
  } finally {
    flexWorkerInitializing = false
  }
}

export async function terminateFlexWorker(): Promise<void> {
  if (flexWorker) {
    await flexWorker.terminate()
    flexWorker = null
  }
}

/**
 * Preprocess a canvas frame for screen-capture OCR.
 * Screen text is already sharp, so we just convert to grayscale
 * and apply mild contrast enhancement without hard thresholding.
 */
export function preprocessScreenCapture(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(sourceCanvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    // Gentle contrast stretch: clamp and remap
    const stretched = Math.min(255, Math.max(0, (gray - 20) * (255 / 215)))
    data[i] = data[i + 1] = data[i + 2] = stretched
    // alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// Common street type suffixes used in US addresses
const STREET_TYPE_RE =
  /\b(ROAD|RD|STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|COURT|CT|DRIVE|DR|LANE|LN|WAY|PLACE|PL|PARKWAY|PKWY|HIGHWAY|HWY|PIKE|CIRCLE|CIR|TRAIL|TRL|LOOP|PASS|CROSSING|XING|TERRACE|TER|ROW|RUN|PATH|PARK)\b/

function splitAddressCity(addrCityStr: string): { address: string; city: string } {
  const str = addrCityStr.trim()
  const m = str.match(STREET_TYPE_RE)

  if (m && m.index !== undefined) {
    const splitIdx = m.index + m[0].length
    const address = str.slice(0, splitIdx).trim()
    const city = str.slice(splitIdx).trim().replace(/^[,.\s]+/, '')
    if (address && city) return { address, city }
  }

  // Fallback: last word is city
  const parts = str.split(/\s+/).filter(Boolean)
  return {
    address: parts.slice(0, -1).join(' '),
    city: parts[parts.length - 1] ?? '',
  }
}

function normalizeOcrText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Fix common OCR substitutions for hash sign
    .replace(/\bH#\b/g, '#')
    .replace(/(?<!\w)[#＃]/g, '#')
    // Fix I/1 confusion in stop codes after '#'
    // (we'll handle per-field, not globally)
    .replace(/[^\x00-\x7F]/g, '') // strip non-ASCII
}

/**
 * Try to parse the OCR text as a sequence of delivery stops.
 * Returns only stops that are not already in seenCodes.
 */
export function parseFlexOcrText(
  rawText: string,
  sessionId: string,
  seenCodes: Set<string> = new Set()
): DeliveryStop[] {
  const text = normalizeOcrText(rawText)
  const results: DeliveryStop[] = []

  // ── Strategy 1: Inline pattern ─────────────────────────────────────────
  // Match: NUMBER  # CODE  ADDRESS_CITY  DELIVER N PACKAGE(S)
  // We allow the # to sometimes be read as "H" or missing.
  const inlineRe =
    /(\d{1,3})\s+(?:#|H#|#+)?\s*([A-Z]{1,4}[-][A-Z0-9]+(?:\.[A-Z0-9]+)*)\s+(\d+\s+[A-Z][A-Z\s]+?)\s+(DELIVER\s+\d+\s+PACKAGES?)/g

  let m: RegExpExecArray | null
  while ((m = inlineRe.exec(text)) !== null) {
    const [, numStr, code, addrCity, delivery] = m
    if (seenCodes.has(code)) continue
    const { address, city } = splitAddressCity(addrCity)
    if (!address || !city) continue
    seenCodes.add(code)
    results.push({
      id: `${sessionId}-${code}`,
      stopNumber: parseInt(numStr, 10),
      stopCode: code,
      address,
      city,
      deliveryInfo: delivery.replace(/\s+/g, ' ').trim(),
      extractedAt: new Date(),
      sessionId,
    })
  }

  if (results.length > 0) return results

  // ── Strategy 2: Multi-line block grouping ──────────────────────────────
  // A new block begins when a line is a standalone stop number
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const blocks: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    const isStopStart = /^\d{1,3}$/.test(line) || /^\d{1,3}\s+[#H]/.test(line)
    if (isStopStart && current.length > 0) {
      blocks.push(current)
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current)

  for (const block of blocks) {
    const stop = parseBlock(block, sessionId, seenCodes)
    if (stop) {
      seenCodes.add(stop.stopCode)
      results.push(stop)
    }
  }

  if (results.length > 0) return results

  // ── Strategy 3: Anchor on DELIVER keyword and work backwards ───────────
  const deliveryMatches = [...text.matchAll(/DELIVER\s+(\d+)\s+(PACKAGES?)/g)]
  for (const dm of deliveryMatches) {
    const deliveryStart = dm.index!
    const beforeDelivery = text.slice(Math.max(0, deliveryStart - 200), deliveryStart)

    const codeMatch = beforeDelivery.match(/([A-Z]{1,4}[-][A-Z0-9]+(?:\.[A-Z0-9]+)*)\s*$/)
    const numMatch = beforeDelivery.match(/\b(\d{1,3})\b/)

    if (!codeMatch || !numMatch) continue
    const code = codeMatch[1]
    if (seenCodes.has(code)) continue

    const addrCityRaw = beforeDelivery
      .slice(beforeDelivery.indexOf(codeMatch[0]) + codeMatch[0].length)
      .trim()
    const { address, city } = splitAddressCity(addrCityRaw)
    if (!address) continue

    seenCodes.add(code)
    results.push({
      id: `${sessionId}-${code}`,
      stopNumber: parseInt(numMatch[1], 10),
      stopCode: code,
      address,
      city,
      deliveryInfo: `DELIVER ${dm[1]} ${dm[2]}`,
      extractedAt: new Date(),
      sessionId,
    })
  }

  return results
}

function parseBlock(
  lines: string[],
  sessionId: string,
  seenCodes: Set<string>
): DeliveryStop | null {
  const combined = lines.join(' ').trim()

  const numMatch = combined.match(/^(\d{1,3})/)
  if (!numMatch) return null

  const codeMatch = combined.match(/(?:#|H#|#+)?\s*([A-Z]{1,4}[-][A-Z0-9]+(?:\.[A-Z0-9]+)*)/)
  if (!codeMatch) return null
  const code = codeMatch[1]
  if (seenCodes.has(code)) return null

  const deliveryMatch = combined.match(/DELIVER\s+(\d+)\s+(PACKAGES?)/)
  if (!deliveryMatch) return null

  const codeEnd = combined.indexOf(codeMatch[0]) + codeMatch[0].length
  const deliveryStart = combined.indexOf(deliveryMatch[0])
  if (deliveryStart <= codeEnd) return null

  const addrCityRaw = combined.slice(codeEnd, deliveryStart).trim()
  const { address, city } = splitAddressCity(addrCityRaw)
  if (!address || !city) return null

  return {
    id: `${sessionId}-${code}`,
    stopNumber: parseInt(numMatch[1], 10),
    stopCode: code,
    address,
    city,
    deliveryInfo: `DELIVER ${deliveryMatch[1]} ${deliveryMatch[2]}`,
    extractedAt: new Date(),
    sessionId,
  }
}
