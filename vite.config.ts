import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '데이로그',
        short_name: '데이로그',
        description: '음식, 수면, 기분, 건강 상태와 소비를 함께 기록합니다.',
        theme_color: '#718d80',
        background_color: '#f8f9f6',
        display: 'standalone',
        lang: 'ko',
      },
    }),
  ],
})
