// 네이버 지도 Web Dynamic Map 동적 로더(§5.5).
// 2026 현재 신규 발급은 NCP 콘솔(Maps), 파라미터는 ncpClientId가 아니라 ncpKeyId.
// Client ID는 도메인 제한된 공개 키라 클라이언트 노출 정상(VITE_*).
let promise: Promise<typeof naver> | null = null

export function isNaverMapConfigured(): boolean {
  return Boolean(import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim())
}

export function loadNaverMaps(): Promise<typeof naver> {
  if (promise) return promise
  const keyId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim()
  promise = new Promise<typeof naver>((resolve, reject) => {
    if (!keyId) {
      reject(new Error('네이버 지도 키(VITE_NAVER_MAP_CLIENT_ID)가 설정되지 않았어요.'))
      return
    }
    // 이미 로드돼 있으면 재사용
    if (typeof window !== 'undefined' && window.naver?.maps) {
      resolve(window.naver)
      return
    }
    const s = document.createElement('script')
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(keyId)}`
    s.async = true
    s.onload = () => {
      if (window.naver?.maps) resolve(window.naver)
      else reject(new Error('네이버 지도 로드에 실패했어요.'))
    }
    s.onerror = () => reject(new Error('네이버 지도 스크립트를 불러오지 못했어요.'))
    document.head.appendChild(s)
  })
  return promise
}
