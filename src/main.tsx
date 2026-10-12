/**
 * React 앱의 브라우저 진입점이다. 공통 스타일과 Leaflet 스타일을 불러온 뒤 root 요소에 App을 StrictMode로 연결한다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import 'leaflet/dist/leaflet.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
