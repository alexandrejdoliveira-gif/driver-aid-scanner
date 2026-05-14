import React from 'react'
import type { ScannedItem } from '../types'

interface PackageTableProps {
  title: string
  icon: string
  color: 'blue' | 'orange'
  items: ScannedItem[]
  onRemove: (id: string) => void
}

export const PackageTable: React.FC<PackageTableProps> = ({ title, icon, color, items, onRemove }) => {
  return (
    <div className={`table-card table-${color}`}>
      <div className="table-header">
        <div className="table-title">
          <span className="table-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            <span className="table-count">{items.length} pacote{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="table-empty">
          <span>Nenhum pacote escaneado ainda</span>
        </div>
      ) : (
        <div className="table-list">
          {[...items].reverse().map((item, idx) => (
            <div key={item.id} className="table-row" style={{ animationDelay: `${idx * 30}ms` }}>
              <div className="row-badge">{items.length - idx}</div>
              <div className="row-content">
                <span className="row-id">{item.trackingId}</span>
                <span className="row-time">
                  {item.scannedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <button
                className="row-remove"
                onClick={() => onRemove(item.id)}
                title="Remover"
                aria-label={`Remover ${item.trackingId}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
