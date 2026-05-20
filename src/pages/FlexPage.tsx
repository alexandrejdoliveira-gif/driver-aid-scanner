import React, { useState, useCallback, useRef } from 'react'
import { FlexExtractor } from '../components/FlexExtractor'
import { StopsList } from '../components/StopsList'
import { ToastContainer, useToast } from '../components/Toast'
import { sendFlexRouteToFirebase } from '../services/flexFirebaseService'
import type { DeliveryStop, ExtractionLog } from '../types'

let logIdCounter = 0

interface FlexPageProps {
  onGoScanner?: () => void
}

export const FlexPage: React.FC<FlexPageProps> = ({ onGoScanner }) => {
  const [stops, setStops] = useState<DeliveryStop[]>([])
  const [logs, setLogs] = useState<ExtractionLog[]>([])
  const [isSending, setIsSending] = useState(false)
  const [sentDocId, setSentDocId] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<'extractor' | 'stops' | 'logs'>('extractor')
  const [sessionId] = useState(() => `FLEX-${Date.now()}`)
  const { toasts, addToast, removeToast } = useToast()
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: ExtractionLog['type']) => {
    const entry: ExtractionLog = {
      id: String(++logIdCounter),
      msg,
      type,
      ts: new Date(),
    }
    setLogs((prev) => {
      const next = [...prev, entry]
      return next.length > 200 ? next.slice(-200) : next
    })
    // Auto-scroll log panel
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  const handleStopsUpdate = useCallback((updated: DeliveryStop[]) => {
    setStops(updated)
  }, [])

  const handleRemoveStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleSend = async () => {
    if (stops.length === 0) {
      addToast('Nenhuma parada para enviar', 'warning')
      return
    }
    setIsSending(true)
    setSentDocId(null)
    addLog(`Enviando ${stops.length} parada(s) para o Firebase...`, 'info')
    try {
      const docId = await sendFlexRouteToFirebase(sessionId, stops)
      setSentDocId(docId)
      addToast(`Rota enviada! ID: ${docId.slice(0, 10)}…`, 'success')
      addLog(`Dados enviados com sucesso. Firebase Doc ID: ${docId}`, 'success')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addToast('Falha ao enviar. Verifique a conexão e tente novamente.', 'error')
      addLog(`Erro no envio: ${msg}`, 'error')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="app-wrapper">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🚗</span>
          <div>
            <h1>Amazon Flex Extractor</h1>
            <span className="session-id">{sessionId}</span>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat-chip">{stops.length} paradas</span>
          {onGoScanner && (
            <button className="mode-switch-btn" onClick={onGoScanner} id="btn-go-scanner">
              📦 Scanner
            </button>
          )}
        </div>
      </header>

    <div className="flex-page">
      {/* Sub-tabs */}
      <nav className="flex-tabs">
        <button
          className={`flex-tab${activePanel === 'extractor' ? ' flex-tab--active' : ''}`}
          onClick={() => setActivePanel('extractor')}
          id="flex-tab-extractor"
        >
          Extração
        </button>
        <button
          className={`flex-tab${activePanel === 'stops' ? ' flex-tab--active' : ''}`}
          onClick={() => setActivePanel('stops')}
          id="flex-tab-stops"
        >
          Paradas
          {stops.length > 0 && <span className="flex-tab-badge">{stops.length}</span>}
        </button>
        <button
          className={`flex-tab${activePanel === 'logs' ? ' flex-tab--active' : ''}`}
          onClick={() => setActivePanel('logs')}
          id="flex-tab-logs"
        >
          Logs
          {logs.length > 0 && <span className="flex-tab-badge">{logs.length}</span>}
        </button>
      </nav>

      <div className="flex-content">
        {/* ── Extractor panel ── */}
        {activePanel === 'extractor' && (
          <>
            <FlexExtractor
              sessionId={sessionId}
              onStopsUpdate={handleStopsUpdate}
              onLog={addLog}
            />

            {/* Send button */}
            <button
              className="send-btn flex-send-btn"
              onClick={handleSend}
              disabled={isSending || stops.length === 0}
              id="btn-send-flex-firebase"
            >
              {isSending ? (
                <>
                  <span className="spinner-sm" /> Enviando…
                </>
              ) : (
                `🔥 Enviar para Firebase (${stops.length} parada${stops.length !== 1 ? 's' : ''})`
              )}
            </button>

            {sentDocId && (
              <div className="sent-confirmation">
                <span className="sent-check">✓</span>
                <div>
                  <strong>Rota enviada com sucesso!</strong>
                  <br />
                  <span className="sent-id">ID: {sentDocId}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Stops panel ── */}
        {activePanel === 'stops' && (
          <div className="stops-panel">
            <div className="stops-panel-header">
              <span>{stops.length} parada(s) extraída(s)</span>
              {stops.length > 0 && (
                <button
                  className="send-btn flex-send-btn"
                  onClick={handleSend}
                  disabled={isSending}
                  id="btn-send-flex-firebase-stops"
                >
                  {isSending ? (
                    <>
                      <span className="spinner-sm" /> Enviando…
                    </>
                  ) : (
                    '🔥 Enviar para Firebase'
                  )}
                </button>
              )}
            </div>
            <StopsList stops={stops} onRemove={handleRemoveStop} />
          </div>
        )}

        {/* ── Logs panel ── */}
        {activePanel === 'logs' && (
          <div className="logs-panel">
            {logs.length === 0 && (
              <p className="logs-empty">Nenhum log ainda. Inicie uma extração.</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className={`log-entry log-entry--${log.type}`}>
                <span className="log-time">
                  {log.ts.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="log-msg">{log.msg}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
    </div>
  )
}
