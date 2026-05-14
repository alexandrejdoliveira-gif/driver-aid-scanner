import Tesseract from 'tesseract.js'
type Worker = Awaited<ReturnType<typeof Tesseract.createWorker>>

let worker: Worker | null = null
let isInitializing = false

export async function getOCRWorker(): Promise<Worker> {
  if (worker) return worker
  if (isInitializing) {
    // Wait for initialization
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return worker!
  }

  isInitializing = true
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {}, // suppress logs
    })
    // Configure for alphanumeric labels
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '7' as never, // single line mode
    })
    return worker
  } finally {
    isInitializing = false
  }
}

export async function terminateOCRWorker() {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}

/**
 * Pre-process canvas for better OCR accuracy:
 * - Grayscale
 * - Contrast enhancement
 * - Thresholding
 */
export function preprocessCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const SCALE = 2
  canvas.width = sourceCanvas.width * SCALE
  canvas.height = sourceCanvas.height * SCALE
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Grayscale + contrast boost
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    // Threshold: make it binary for sharper OCR
    const val = gray > 128 ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = val
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Extract tracking ID from OCR text.
 * Driver Aid labels typically contain alphanumeric codes like:
 * TBA123456789, D01-1234567, BA12345, etc.
 */
export function extractTrackingId(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim().toUpperCase()

  // Try common Driver Aid / Amazon Flex patterns
  const patterns = [
    /\b(TBA\d{9,12})\b/,          // TBA + 9-12 digits
    /\b(D\d{2}-\d{7,9})\b/,       // D01-1234567
    /\b([A-Z]{2,3}\d{7,12})\b/,   // 2-3 letters + 7-12 digits
    /\b(\d{12,18})\b/,             // Pure 12-18 digit barcode
    /\b([A-Z0-9]{8,20})\b/,       // Generic alphanumeric 8-20 chars
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) return match[1]
  }

  return null
}
