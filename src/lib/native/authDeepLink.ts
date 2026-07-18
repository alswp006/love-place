import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'

// OAuth/매직링크가 커스텀 스킴(app.loveplace://auth/callback)으로 앱에 돌아오면(appUrlOpen)
// URL의 code를 세션으로 교환한다. (1차 인증 경로는 OTP 코드이지만, 링크 경로도 가능한 한 살린다.) 웹에선 no-op.
export async function exchangeFromUrl(url: string): Promise<boolean> {
  try {
    const code = new URL(url).searchParams.get('code')
    if (!code) return false
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    // 복귀해도 로그인에 쓴 시스템 브라우저 시트가 앱 위에 남아 있으므로 닫는다(웹/미지원은 무시).
    if (!error) void Browser.close().catch(() => {})
    return !error
  } catch {
    return false
  }
}

export function initNativeAuthDeepLink(): void {
  if (!isNativePlatform()) return
  void App.addListener('appUrlOpen', ({ url }) => {
    void exchangeFromUrl(url)
  })
}
