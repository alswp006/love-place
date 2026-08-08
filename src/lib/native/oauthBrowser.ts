import { Browser } from '@capacitor/browser'
import { supabase } from '@/lib/supabase/client'

// OAuth용 시스템 브라우저 열기 + **사용자가 그냥 닫았을 때 되돌리기**.
//
// 왜 필요한가: 네이티브에서는 구글/애플 동의 화면을 시스템 브라우저로 열고, 복귀는 커스텀 스킴
// 딥링크로만 온다. 그래서 사용자가 시트를 그냥 내려 닫으면 **아무 신호도 오지 않고**
// 로그인 버튼이 '구글로 이동 중…'에 영원히 갇혔다. 다시 누를 수도 없었다(disabled).
//
// browserFinished는 성공해서 우리가 닫을 때도 뜬다. 그래서 이벤트만으로는 취소인지 알 수 없고,
// **세션이 생겼는지**로 가른다: 세션이 있으면 성공(그대로 두고 화면 전환을 기다린다),
// 없으면 취소로 보고 버튼을 되돌린다.

/** 딥링크 → 코드 교환 → Browser.close()가 끝날 여유. 이보다 짧으면 성공을 취소로 오인한다. */
const SETTLE_MS = 600

export async function openOAuthBrowser(url: string, onCancelled: () => void): Promise<void> {
  let done = false
  const handle = await Browser.addListener('browserFinished', () => {
    if (done) return
    done = true
    void handle.remove()
    // 성공 경로에서도 이 이벤트가 뜨므로 잠깐 기다렸다 세션을 확인한다.
    setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session) onCancelled()
      })
    }, SETTLE_MS)
  })

  try {
    await Browser.open({ url })
  } catch (e) {
    done = true
    void handle.remove()
    onCancelled()
    throw e
  }
}
