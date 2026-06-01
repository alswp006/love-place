/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// 설계서 §2(웹앱) / .claude/rules/web-stack.md §1 — Vite + React + TS strict + PWA.
// 외부 키는 클라이언트에 없음(§10.1) — VITE_* 공개값만 번들에 들어간다.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 정적 셸만 캐시. Supabase 데이터 쓰기는 §4.3 오프라인 큐가 담당(Workbox가 mutation 큐를 대신하지 않음 — web-stack.md §1).
      // globPatterns가 public/의 아이콘·매니페스트를 이미 잡으므로 includeAssets는 불필요(중복 프리캐시 방지).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      manifest: false, // public/manifest.webmanifest를 직접 관리(index.html link 태그로 연결)
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
    // Playwright e2e는 vitest가 수집하지 않는다(별도 러너).
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['**/*.config.*', '**/__tests__/**', 'e2e/**', 'dist/**'],
    },
  },
})
