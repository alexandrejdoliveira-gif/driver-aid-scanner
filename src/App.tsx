import React, { useState } from 'react'
import { ScannerPage } from './pages/ScannerPage'
import { FlexPage } from './pages/FlexPage'
import './index.css'

type AppTab = 'scanner' | 'flex'

const App: React.FC = () => {
  const [tab, setTab] = useState<AppTab>('scanner')

  return tab === 'scanner' ? (
    <ScannerPage onGoFlex={() => setTab('flex')} />
  ) : (
    <FlexPage onGoScanner={() => setTab('scanner')} />
  )
}

export default App
