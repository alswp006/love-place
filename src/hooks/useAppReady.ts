import { useEffect } from 'react'
import { markAppReady } from '@/lib/native/splash'

/**
 * 이 화면이 마운트되면 앱이 '준비됐다'고 보고 스플래시를 걷는다.
 *
 * **최상위 진입 화면에서만** 쓴다 — 앱 셸(AppLayout), 로그인(/auth), 연결(/onboarding).
 * 로딩 폴백(RouteFallback)에는 절대 붙이지 말 것: 스피너를 보여주려고 스플래시를 걷는 꼴이라
 * 원래 문제(스플래시 → 빈 셸 → 진짜 화면)로 그대로 되돌아간다.
 */
export function useAppReady(): void {
  useEffect(() => {
    markAppReady()
  }, [])
}
