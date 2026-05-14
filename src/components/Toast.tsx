import React, { useState, useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  onDismiss: () => void
}

export const Toast: React.FC<ToastProps> = ({ message, type, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }

  return (
    <div className={`toast toast-${type}`} role="alert">
      <span className="toast-icon">{icons[type]}</span>
      <span>{message}</span>
    </div>
  )
}

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => (
  <div className="toast-container">
    {toasts.map((t) => (
      <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => onDismiss(t.id)} />
    ))}
  </div>
)

// Hook
let toastIdCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = (message: string, type: ToastItem['type'] = 'info') => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return { toasts, addToast, removeToast }
}
