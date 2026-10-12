/**
 * Vite의 React 빌드와 로컬 개발·미리보기 서버를 설정한다. /seoul-api 요청은 서울시 API로 중계하고 요청 경로의 접두사를 제거한다.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 서버와 빌드에 같은 React 플러그인을 적용한다.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/seoul-api': {
        target: 'http://openapi.seoul.go.kr:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seoul-api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/seoul-api': {
        target: 'http://openapi.seoul.go.kr:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seoul-api/, ''),
      },
    },
  },
})
