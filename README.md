# Driver Aid Scanner

Aplicativo PWA para scan OCR de etiquetas Driver Aid — organização de pacotes durante carregamento.

## 🚀 Setup

### 1. Firebase
1. Crie um projeto em [Firebase Console](https://console.firebase.google.com)
2. Ative **Firestore Database** (modo produção)
3. Copie as credenciais do Web App
4. Edite `.env.local` com seus valores:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 2. Regras Firestore
No Firebase Console → Firestore → Regras:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{session} {
      allow read, write: if true;
    }
  }
}
```

### 3. Rodar localmente
```bash
npm install
npm run dev
```

### 4. Deploy Vercel
1. Push para GitHub
2. Importe o repositório no [Vercel](https://vercel.com)
3. Defina as variáveis de ambiente (`VITE_FIREBASE_*`) no painel do Vercel
4. Deploy automático!

## 📱 Usar no Android
Após deploy, no Chrome Android:
- Acesse a URL do Vercel
- Menu → "Adicionar à tela inicial"
- Use como app nativo (tela cheia, sem barra do navegador)

## 📦 Estrutura do Firestore

Coleção `sessions`:
```json
{
  "sessionId": "SES-1234567890",
  "createdAt": "Timestamp",
  "envelopes": [{ "trackingId": "TBA123456789", "scannedAt": "ISO" }],
  "caixas":    [{ "trackingId": "TBA987654321", "scannedAt": "ISO" }],
  "consolidated": [
    { "trackingId": "TBA123456789", "table": "Envelopes", "scannedAt": "ISO" },
    { "trackingId": "TBA987654321", "table": "Caixas",    "scannedAt": "ISO" }
  ],
  "totalPackages": 2
}
```
