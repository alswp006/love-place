import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/state/auth'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/app/router'
import { registerPwa } from '@/lib/pwa'
import { initNativeAuthDeepLink } from '@/lib/native/authDeepLink'
import { initNative } from '@/lib/native/initNative'
// self-host 웹폰트(OFL) — 본문 Pretendard, 디스플레이 Quicksand(400/500/600만). Cafe24는 tokens.css @font-face.
import 'pretendard/dist/web/static/pretendard.css'
import '@fontsource/quicksand/400.css'
import '@fontsource/quicksand/500.css'
import '@fontsource/quicksand/600.css'
import './styles/tokens.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

// PWA 서비스워커 등록(브라우저 전용 — 네이티브는 src/lib/pwa.ts에서 게이트).
void registerPwa()

// 네이티브 매직링크 딥링크 복귀 처리(웹에선 no-op).
initNativeAuthDeepLink()

// 네이티브 셸 폴리시(상태바·안드로이드 백·스플래시 숨김 — 웹에선 no-op).
initNative()
