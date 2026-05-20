import React from 'react'
import type { DeliveryStop } from '../types'

interface StopsListProps {
  stops: DeliveryStop[]
  onRemove?: (id: string) => void
}

export const StopsList: React.FC<StopsListProps> = ({ stops, onRemove }) => {
  const sorted = [...stops].sort((a, b) => a.stopNumber - b.stopNumber)

  if (sorted.length === 0) {
    return (
      <div className="stops-empty">
        <span>Nenhuma parada extraída ainda</span>
      </div>
    )
  }

  return (
    <div className="stops-list">
      {sorted.map((stop) => (
        <div key={stop.id} className="stop-row">
          <div className="stop-num">{stop.stopNumber}</div>
          <div className="stop-body">
            <div className="stop-top">
              <span className="stop-code">{stop.stopCode}</span>
              <span className="stop-delivery">{stop.deliveryInfo}</span>
            </div>
            <div className="stop-address">{stop.address}</div>
            <div className="stop-city">{stop.city}</div>
          </div>
          {onRemove && (
            <button
              className="stop-remove"
              onClick={() => onRemove(stop.id)}
              aria-label={`Remover parada ${stop.stopNumber}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
