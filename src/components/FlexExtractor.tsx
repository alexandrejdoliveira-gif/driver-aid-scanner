import React, { useRef, useEffect, useCallback, useState } from 'react'
import {
  getFlexOCRWorker,
  preprocessScreenCapture,
  parseFlexOcrText,
} from '../services/flexOcrService'
import type { DeliveryStop, ExtractionLog } from '../types'

// How many consecutive frames with zero new stops before we signal end-of-list
const EMPTY_FRAMES_WARN = 4
const EMPTY_FRAMES_STOP = 8
// Interval between captures in ms
const CAPTURE_INTERVAL_MS = 2000

interface FlexExtractorProps {
  sessionId: string
  onStopsUpdate: (stops: DeliveryStop[]) => void
  onLog: (msg: string, type: ExtractionLog['type']) => void
}

export const FlexExtractor: React.FC<FlexExtractorProps> = ({
  sessionId,
  onStopsUpdate,
  onLog,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  // Map<stopCode, DeliveryStop> — single source of truth across all captures
  const stopsMapRef = useRef<Map<string, DeliveryStop>>(new Map())
  // Codes seen so far — passed to the parser to avoid re-parsing known items
  const seenCodesRef = useRef<Set<string>>(new Set())
  const consecutiveEmptyRef = useRef(0)
  const isProcessingRef = useRef(false)
  const frameCountRef = useRef(0)

  const [workerReady, setWorkerReady] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [stopCount, setStopCount] = useState(0)
  const [statusMsg, setStatusMsg] = useState('Pronto para iniciar')
  const [statusLevel, setStatusLevel] = useState<'idle' | 'active' | 'warn' | 'done'>('idle')
  const [supportsDisplayMedia] = useState(
    () => typeof navigator !== 'undefined' && 'getDisplayMedia' in navigator.mediaDevices
  )

  // Initialise OCR worker once
  useEffect(() => {
    onLog('Inicializando motor OCR...', 'info')
    getFlexOCRWorker()
      .then(() => {
        setWorkerReady(true)
        onLog('OCR pronto.', 'success')
      })
      .catch((e) => {
        onLog(`Falha ao inicializar OCR: ${String(e)}`, 'error')
      })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCaptureStream()
    }
  }, [])

  // ── Internal helpers ────────────────────────────────────────────────────

  const stopCaptureStream = useCallback(() => {
    if (captureTimerRef.current !== null) {
      clearInterval(captureTimerRef.current)
      captureTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const commitStops = useCallback(() => {
    const arr = Array.from(stopsMapRef.current.values())
    setStopCount(arr.length)
    onStopsUpdate(arr)
  }, [onStopsUpdate])

  const processOcrText = useCallback(
    (text: string) => {
      const newStops = parseFlexOcrText(text, sessionId, seenCodesRef.current)

      if (newStops.length > 0) {
        consecutiveEmptyRef.current = 0
        for (const s of newStops) {
          stopsMapRef.current.set(s.stopCode, s)
          seenCodesRef.current.add(s.stopCode)
          onLog(
            `[+] Parada ${s.stopNumber} · ${s.stopCode} · ${s.address}, ${s.city} · ${s.deliveryInfo}`,
            'success'
          )
        }
        commitStops()
        return newStops.length
      }

      consecutiveEmptyRef.current++
      return 0
    },
    [sessionId, commitStops, onLog]
  )

  const captureFrame = useCallback(async () => {
    if (isProcessingRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      onLog('[DEBUG] Frame ignorado — vídeo não pronto', 'info')
      return
    }

    isProcessingRef.current = true
    frameCountRef.current++
    const frameN = frameCountRef.current

    try {
      const ctx = canvas.getContext('2d')!
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)

      if (canvas.width === 0 || canvas.height === 0) {
        onLog('[DEBUG] Frame vazio, pulando', 'info')
        return
      }

      const processed = preprocessScreenCapture(canvas)
      const worker = await getFlexOCRWorker()
      const {
        data: { text, confidence },
      } = await worker.recognize(processed)

      onLog(
        `[Frame ${frameN}] Confiança OCR: ${confidence.toFixed(0)}% · ${text.length} chars`,
        'info'
      )

      if (confidence < 15) {
        onLog('[AVISO] Confiança baixa demais — verifique se a tela está visível', 'warn')
        return
      }

      const added = processOcrText(text)
      const emptyCount = consecutiveEmptyRef.current

      if (added > 0) {
        setStatusMsg(
          `${stopsMapRef.current.size} parada(s) extraída(s) — continue rolando a lista`
        )
        setStatusLevel('active')
      } else if (emptyCount >= EMPTY_FRAMES_WARN) {
        setStatusMsg(
          emptyCount >= EMPTY_FRAMES_STOP
            ? 'Nenhum item novo por muitos frames — encerrando automaticamente'
            : `Sem novos itens nos últimos ${emptyCount} frames — role para baixo ou pare`
        )
        setStatusLevel('warn')

        if (emptyCount >= EMPTY_FRAMES_STOP) {
          onLog(
            `[INFO] ${EMPTY_FRAMES_STOP} frames sem novos dados — captura encerrada automaticamente`,
            'info'
          )
          stopCapture()
        }
      }
    } catch (err: unknown) {
      onLog(`[ERRO] Falha no frame ${frameN}: ${String(err)}`, 'warn')
    } finally {
      isProcessingRef.current = false
    }
  }, [processOcrText, stopCaptureStream, onLog])

  // ── Public controls ─────────────────────────────────────────────────────

  const startCapture = useCallback(async () => {
    if (!workerReady) {
      onLog('OCR ainda não está pronto, aguarde...', 'warn')
      return
    }

    try {
      onLog('Solicitando permissão de captura de tela...', 'info')
      // getDisplayMedia is not in the standard TS lib yet for all envs
      const stream = await (
        navigator.mediaDevices as MediaDevices & {
          getDisplayMedia(opts?: object): Promise<MediaStream>
        }
      ).getDisplayMedia({
        video: {
          frameRate: { ideal: 2, max: 4 },
          cursor: 'always',
        },
        audio: false,
      })

      streamRef.current = stream

      // React to user closing share via OS/browser controls
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        onLog('Captura encerrada pelo sistema', 'warn')
        stopCapture()
      })

      const video = videoRef.current!
      video.srcObject = stream
      await video.play()

      consecutiveEmptyRef.current = 0
      frameCountRef.current = 0
      setIsCapturing(true)
      setStatusMsg('Capturando — role devagar a lista no Amazon Flex')
      setStatusLevel('active')
      onLog(
        'Captura iniciada. Abra o Amazon Flex, vá para a lista de entregas e role devagar.',
        'success'
      )

      captureTimerRef.current = window.setInterval(captureFrame, CAPTURE_INTERVAL_MS)
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err.name === 'NotAllowedError') {
        onLog('Permissão de captura de tela negada pelo usuário', 'warn')
      } else {
        onLog(`Erro ao iniciar captura: ${err.message ?? String(e)}`, 'error')
      }
    }
  }, [workerReady, captureFrame, onLog])

  const stopCapture = useCallback(() => {
    stopCaptureStream()
    setIsCapturing(false)
    const total = stopsMapRef.current.size
    setStatusMsg(`Captura encerrada — ${total} parada(s) extraída(s)`)
    setStatusLevel(total > 0 ? 'done' : 'idle')
    onLog(`Captura encerrada. Total de paradas únicas: ${total}`, 'info')
  }, [stopCaptureStream, onLog])

  const resetExtraction = useCallback(() => {
    stopsMapRef.current.clear()
    seenCodesRef.current.clear()
    consecutiveEmptyRef.current = 0
    frameCountRef.current = 0
    setStopCount(0)
    setStatusMsg('Pronto para iniciar')
    setStatusLevel('idle')
    onStopsUpdate([])
    onLog('Extração reiniciada.', 'info')
  }, [onStopsUpdate, onLog])

  // ── File upload (fallback) ──────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length === 0) return
      if (!workerReady) {
        onLog('OCR não está pronto', 'warn')
        return
      }

      setIsProcessingFile(true)
      setStatusMsg(`Processando ${files.length} imagem(ns)...`)
      setStatusLevel('active')
      onLog(`Iniciando processamento de ${files.length} screenshot(s)`, 'info')

      const canvas = canvasRef.current!

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        onLog(`[${i + 1}/${files.length}] Processando: ${file.name}`, 'info')

        try {
          const url = URL.createObjectURL(file)
          const img = new Image()
          img.src = url

          await new Promise<void>((res, rej) => {
            img.onload = () => res()
            img.onerror = () => rej(new Error('Falha ao carregar imagem'))
          })

          canvas.width = img.width
          canvas.height = img.height
          canvas.getContext('2d')!.drawImage(img, 0, 0)
          URL.revokeObjectURL(url)

          const processed = preprocessScreenCapture(canvas)
          const worker = await getFlexOCRWorker()
          const {
            data: { text, confidence },
          } = await worker.recognize(processed)

          onLog(
            `[${i + 1}/${files.length}] OCR concluído — confiança: ${confidence.toFixed(0)}% · ${text.length} chars`,
            'info'
          )

          const added = processOcrText(text)
          onLog(
            `[${i + 1}/${files.length}] +${added} nova(s) parada(s) (total: ${stopsMapRef.current.size})`,
            added > 0 ? 'success' : 'info'
          )
        } catch (err: unknown) {
          onLog(`[${i + 1}/${files.length}] Erro: ${String(err)}`, 'warn')
        }
      }

      const total = stopsMapRef.current.size
      setStatusMsg(`Concluído — ${total} parada(s) extraída(s) de ${files.length} imagem(ns)`)
      setStatusLevel(total > 0 ? 'done' : 'idle')
      onLog(`Processamento de arquivos concluído. Total: ${total} paradas.`, 'success')
      setIsProcessingFile(false)
      e.target.value = ''
    },
    [workerReady, processOcrText, onLog]
  )

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-extractor">
      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Hidden video — always mounted so ref is available when stream starts */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      {/* Status bar */}
      <div className={`extractor-status extractor-status--${statusLevel}`}>
        <span className={`status-dot${isCapturing ? ' status-dot--pulse' : ''}`} />
        <span className="status-text">{statusMsg}</span>
        {!workerReady && <span className="status-loading">carregando OCR…</span>}
      </div>

      {/* Counter */}
      <div className="extractor-counter">
        <span className="extractor-counter__num">{stopCount}</span>
        <span className="extractor-counter__label">parada(s) extraída(s)</span>
      </div>

      {/* Controls */}
      <div className="extractor-controls">
        {!isCapturing && !isProcessingFile && (
          <>
            {supportsDisplayMedia && (
              <button
                className="extractor-btn extractor-btn--primary"
                onClick={startCapture}
                disabled={!workerReady}
                id="btn-start-flex-capture"
              >
                {workerReady ? '📱 Capturar Tela' : 'Carregando OCR…'}
              </button>
            )}

            <label
              className={`extractor-btn extractor-btn--secondary${!workerReady ? ' extractor-btn--disabled' : ''}`}
              htmlFor="flex-img-upload"
            >
              🖼 Carregar Screenshots
              <input
                id="flex-img-upload"
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                disabled={!workerReady}
              />
            </label>

            {stopCount > 0 && (
              <button
                className="extractor-btn extractor-btn--ghost"
                onClick={resetExtraction}
                id="btn-reset-extraction"
              >
                ↺ Reiniciar
              </button>
            )}
          </>
        )}

        {isCapturing && (
          <button
            className="extractor-btn extractor-btn--danger"
            onClick={stopCapture}
            id="btn-stop-flex-capture"
          >
            ⏹ Parar Captura
          </button>
        )}

        {isProcessingFile && (
          <div className="extractor-processing">
            <span className="spinner-sm" />
            <span>Processando imagens…</span>
          </div>
        )}
      </div>

      {/* Instructions — only when idle and no stops yet */}
      {!isCapturing && !isProcessingFile && stopCount === 0 && (
        <div className="extractor-instructions">
          <h3>Como usar</h3>
          <div className="instructions-grid">
            <div className="inst-col">
              <p className="inst-title">📱 Captura de Tela (recomendado)</p>
              <ol>
                <li>Toque em <strong>Capturar Tela</strong></li>
                <li>Selecione <em>Tela inteira</em> quando solicitado</li>
                <li>Use modo tela dividida: Amazon Flex em cima, este app embaixo</li>
                <li>No Amazon Flex, abra a lista de entregas</li>
                <li>Role <strong>devagar</strong> para baixo</li>
                <li>O app extrai as paradas automaticamente a cada 2s</li>
                <li>Ao finalizar, toque em <strong>Parar Captura</strong></li>
              </ol>
            </div>
            <div className="inst-col">
              <p className="inst-title">🖼 Screenshots (alternativo)</p>
              <ol>
                <li>No Amazon Flex, tire prints de cada parte da lista</li>
                <li>Toque em <strong>Carregar Screenshots</strong></li>
                <li>Selecione todos os prints de uma vez</li>
                <li>Aguarde o processamento OCR</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
