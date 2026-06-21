import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/state/auth'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/app/router'
import { registerPwa } from '@/lib/pwa'
import { initNativeAuthDeepLink } from '@/lib/native/authDeepLink'
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
