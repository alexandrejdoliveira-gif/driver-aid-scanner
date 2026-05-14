import React, { useRef, useEffect, useCallback, useState } from 'react'
import { getOCRWorker, preprocessCanvas, extractTrackingId } from '../services/ocrService'

interface CameraScannerProps {
  isActive: boolean
  onScanResult: (trackingId: string) => void
  onError: (msg: string) => void
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ isActive, onScanResult, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const lastScanRef = useRef<string | null>(null)
  const cooldownRef = useRef(false)
  const [workerReady, setWorkerReady] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  // Initialize OCR worker
  useEffect(() => {
    getOCRWorker().then(() => setWorkerReady(true)).catch(() => onError('Falha ao inicializar OCR'))
  }, [])

  // Camera start/stop
  useEffect(() => {
    if (isActive) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [isActive])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: 'continuous' as never,
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e) {
      onError('Câmera não acessível. Verifique as permissões.')
    }
  }

  const stopCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Auto-scan loop — runs every 800ms
  useEffect(() => {
    if (!isActive || !workerReady) return

    scanIntervalRef.current = window.setInterval(() => {
      if (!isProcessingRef.current && !cooldownRef.current) {
        captureAndScan()
      }
    }, 800)

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    }
  }, [isActive, workerReady])

  const captureAndScan = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    isProcessingRef.current = true

    try {
      const ctx = canvas.getContext('2d')!
      // Crop center 60% of frame for faster OCR
      const sw = video.videoWidth * 0.8
      const sh = video.videoHeight * 0.4
      const sx = (video.videoWidth - sw) / 2
      const sy = (video.videoHeight - sh) / 2

      canvas.width = sw
      canvas.height = sh
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)

      const processed = preprocessCanvas(canvas)
      const w = await getOCRWorker()
      const { data: { text } } = await w.recognize(processed)
      const id = extractTrackingId(text)

      if (id && id !== lastScanRef.current) {
        lastScanRef.current = id
        cooldownRef.current = true
        onScanResult(id)
        // 2.5s cooldown before scanning same label again
        setTimeout(() => {
          cooldownRef.current = false
          lastScanRef.current = null
        }, 2500)
      }
    } catch (_) {
      // silent fail — retry next interval
    } finally {
      isProcessingRef.current = false
    }
  }, [onScanResult])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(!torchOn)
    } catch (_) {}
  }

  return (
    <div className="scanner-container">
      <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Scan frame overlay */}
      <div className="scan-overlay">
        <div className="scan-frame">
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <div className="scan-line" />
        </div>
        <p className="scan-hint">Alinhe a etiqueta dentro da área</p>
      </div>

      {/* Torch button */}
      <button className="torch-btn" onClick={toggleTorch} title="Lanterna">
        {torchOn ? '🔦' : '💡'}
      </button>

      {!workerReady && (
        <div className="ocr-loading">
          <div className="spinner" />
          <span>Carregando OCR...</span>
        </div>
      )}
    </div>
  )
}
