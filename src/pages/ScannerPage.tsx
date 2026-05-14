import React, { useState, useCallback, useRef } from 'react'
import { CameraScanner } from '../components/CameraScanner'
import { PackageTable } from '../components/PackageTable'
import { ToastContainer, useToast } from '../components/Toast'
import { sendSessionToFirebase } from '../services/firebaseService'
import type { ScannedItem } from '../types'

type ActiveTable = 'envelopes' | 'caixas'
type AppView = 'scanner' | 'tables' | 'summary'

let itemIdCounter = 0

export const ScannerPage: React.FC = () => {
  const [activeTable, setActiveTable] = useState<ActiveTable>('envelopes')
  const [envelopes, setEnvelopes] = useState<ScannedItem[]>([])
  const [caixas, setCaixas] = useState<ScannedItem[]>([])
  const [isScannerActive, setIsScannerActive] = useState(false)
  const [view, setView] = useState<AppView>('scanner')
  const [isSending, setIsSending] = useState(false)
  const [sessionId] = useState(() => `SES-${Date.now()}`)
  const [manualInput, setManualInput] = useState('')
  const { toasts, addToast, removeToast } = useToast()
  const scanSoundRef = useRef<AudioContext | null>(null)

  const playBeep = useCallback(() => {
    try {
      const ctx = scanSoundRef.current ?? new AudioContext()
      scanSoundRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.15)
    } catch (_) {}
  }, [])

  const addItem = useCallback((trackingId: string, table: ActiveTable) => {
    const currentList = table === 'envelopes' ? envelopes : caixas
    const allItems = [...envelopes, ...caixas]

    // Check for duplicate in BOTH tables
    const existing = allItems.find((i) => i.trackingId === trackingId)
    if (existing) {
      addToast(
        `⚠ Já escaneado em ${existing.table === 'envelopes' ? 'Envelopes' : 'Caixas'}: ${trackingId}`,
        'warning'
      )
      return
    }

    const item: ScannedItem = {
      id: String(++itemIdCounter),
      trackingId,
      scannedAt: new Date(),
      table,
      sessionId,
    }

    if (table === 'envelopes') setEnvelopes((prev) => [...prev, item])
    else setCaixas((prev) => [...prev, item])

    playBeep()
    addToast(`✓ ${trackingId} → ${table === 'envelopes' ? 'Envelopes' : 'Caixas'}`, 'success')
  }, [envelopes, caixas, sessionId, addToast, playBeep])

  const handleScanResult = useCallback((trackingId: string) => {
    addItem(trackingId, activeTable)
  }, [addItem, activeTable])

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const id = manualInput.trim().toUpperCase()
    if (!id) return
    addItem(id, activeTable)
    setManualInput('')
  }

  const removeItem = (table: ActiveTable, id: string) => {
    if (table === 'envelopes') setEnvelopes((prev) => prev.filter((i) => i.id !== id))
    else setCaixas((prev) => prev.filter((i) => i.id !== id))
  }

  const handleSendToFirebase = async () => {
    if (envelopes.length === 0 && caixas.length === 0) {
      addToast('Nenhum pacote para enviar', 'warning')
      return
    }
    setIsSending(true)
    try {
      const docId = await sendSessionToFirebase(sessionId, envelopes, caixas)
      addToast(`Sessão enviada! ID: ${docId.slice(0, 8)}...`, 'success')
      setView('summary')
    } catch (e) {
      addToast('Erro ao enviar para Firebase. Verifique as credenciais.', 'error')
    } finally {
      setIsSending(false)
    }
  }

  const handleNewSession = () => {
    setEnvelopes([])
    setCaixas([])
    setView('scanner')
    setIsScannerActive(false)
  }

  const totalPackages = envelopes.length + caixas.length

  return (
    <div className="app-wrapper">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">📦</span>
          <div>
            <h1>Driver Aid Scanner</h1>
            <span className="session-id">{sessionId}</span>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat-chip">{totalPackages} total</span>
        </div>
      </header>

      {/* ── Nav Tabs ── */}
      <nav className="view-tabs">
        <button
          className={`tab ${view === 'scanner' ? 'active' : ''}`}
          onClick={() => setView('scanner')}
          id="tab-scanner"
        >
          📷 Scanner
        </button>
        <button
          className={`tab ${view === 'tables' ? 'active' : ''}`}
          onClick={() => setView('tables')}
          id="tab-tables"
        >
          📋 Tabelas
          {totalPackages > 0 && <span className="tab-badge">{totalPackages}</span>}
        </button>
      </nav>

      {/* ══════════ SCANNER VIEW ══════════ */}
      {view === 'scanner' && (
        <div className="scanner-view">
          {/* Table selector */}
          <div className="table-selector">
            <button
              id="btn-envelopes"
              className={`selector-btn ${activeTable === 'envelopes' ? 'active-blue' : ''}`}
              onClick={() => setActiveTable('envelopes')}
            >
              <span className="sel-icon">✉️</span>
              <span>Envelopes</span>
              <span className="sel-count">{envelopes.length}</span>
            </button>
            <button
              id="btn-caixas"
              className={`selector-btn ${activeTable === 'caixas' ? 'active-orange' : ''}`}
              onClick={() => setActiveTable('caixas')}
            >
              <span className="sel-icon">📦</span>
              <span>Caixas</span>
              <span className="sel-count">{caixas.length}</span>
            </button>
          </div>

          {/* Active indicator */}
          <div className={`active-indicator ${activeTable}`}>
            Escaneando para:{' '}
            <strong>{activeTable === 'envelopes' ? '✉️ Envelopes (Banco da Frente)' : '📦 Caixas (Porta-malas)'}</strong>
          </div>

          {/* Camera area */}
          <div className="camera-area">
            {isScannerActive ? (
              <CameraScanner
                isActive={isScannerActive}
                onScanResult={handleScanResult}
                onError={(msg) => addToast(msg, 'error')}
              />
            ) : (
              <div className="camera-placeholder" onClick={() => setIsScannerActive(true)} id="start-camera-btn">
                <div className="placeholder-icon">📷</div>
                <p>Toque para iniciar a câmera</p>
                <span>O scanner será automático</span>
              </div>
            )}

            {isScannerActive && (
              <button className="stop-btn" onClick={() => setIsScannerActive(false)} id="stop-scanner-btn">
                ⏹ Parar Scanner
              </button>
            )}
          </div>

          {/* Manual input fallback */}
          <form className="manual-form" onSubmit={handleManualAdd} id="manual-input-form">
            <input
              id="manual-tracking-input"
              className="manual-input"
              type="text"
              placeholder="Digite o ID manualmente..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              autoCapitalize="characters"
            />
            <button type="submit" className="manual-btn" id="manual-add-btn">
              Adicionar
            </button>
          </form>

          {/* Send button */}
          <button
            className="send-btn"
            onClick={handleSendToFirebase}
            disabled={isSending || totalPackages === 0}
            id="send-firebase-btn"
          >
            {isSending ? (
              <>
                <span className="spinner-sm" /> Enviando...
              </>
            ) : (
              `🔥 Finalizar & Enviar (${totalPackages} pacotes)`
            )}
          </button>
        </div>
      )}

      {/* ══════════ TABLES VIEW ══════════ */}
      {view === 'tables' && (
        <div className="tables-view">
          <PackageTable
            title="Envelopes"
            icon="✉️"
            color="blue"
            items={envelopes}
            onRemove={(id) => removeItem('envelopes', id)}
          />
          <PackageTable
            title="Caixas"
            icon="📦"
            color="orange"
            items={caixas}
            onRemove={(id) => removeItem('caixas', id)}
          />

          <button
            className="send-btn"
            onClick={handleSendToFirebase}
            disabled={isSending || totalPackages === 0}
            id="send-firebase-btn-tables"
          >
            {isSending ? (
              <>
                <span className="spinner-sm" /> Enviando...
              </>
            ) : (
              `🔥 Finalizar & Enviar (${totalPackages} pacotes)`
            )}
          </button>
        </div>
      )}

      {/* ══════════ SUMMARY VIEW ══════════ */}
      {view === 'summary' && (
        <div className="summary-view">
          <div className="summary-card">
            <div className="summary-check">✓</div>
            <h2>Sessão Enviada!</h2>
            <p>Dados consolidados no Firebase com sucesso.</p>

            <div className="summary-stats">
              <div className="stat-box blue">
                <span className="stat-num">{envelopes.length}</span>
                <span className="stat-label">✉️ Envelopes</span>
              </div>
              <div className="stat-box orange">
                <span className="stat-num">{caixas.length}</span>
                <span className="stat-label">📦 Caixas</span>
              </div>
              <div className="stat-box green">
                <span className="stat-num">{totalPackages}</span>
                <span className="stat-label">Total</span>
              </div>
            </div>

            {/* Consolidated preview */}
            <div className="consolidated-table">
              <h3>Tabela Consolidada</h3>
              <div className="consolidated-list">
                {[...envelopes, ...caixas].map((item) => (
                  <div key={item.id} className={`consol-row ${item.table}`}>
                    <span className={`consol-badge ${item.table}`}>
                      {item.table === 'envelopes' ? 'ENV' : 'CX'}
                    </span>
                    <span className="consol-id">{item.trackingId}</span>
                    <span className="consol-time">
                      {item.scannedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button className="new-session-btn" onClick={handleNewSession} id="new-session-btn">
              ＋ Nova Sessão
            </button>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}
