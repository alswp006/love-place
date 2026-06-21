import { App } from '@capacitor/app'
import { supabase } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'

// 매직링크가 커스텀 스킴/유니버설 링크로 앱에 돌아오면(appUrlOpen) URL의 code를 세션으로 교환한다.
// (1차 인증 경로는 OTP 코드이지만, 링크 경로도 가능한 한 살린다.) 웹에선 no-op.
export async function exchangeFromUrl(url: string): Promise<boolean> {
  try {
    const code = new URL(url).searchParams.get('code')
    if (!code) return false
    const { error } = await supabase.auth.exchangeCodeForSession(code)
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
