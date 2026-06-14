// 네이버 길찾기 딥링크(순수) — 키/백엔드 불필요. 앱 스킴 + https 웹 폴백.
// 정확한 스킴/파라미터는 실기기(모바일 Safari)에서 verify 후 고정(spec §13 열린 항목).
const APPNAME = 'place.lovemap'

export type DirTarget = { lat: number; lng: number; name: string }

// 네이버 지도 앱 스킴 — 목적지(d*) 좌표/이름 + appname(복귀용).
// 쿼리는 직접 인코딩한다(URLSearchParams는 공백을 '+'로 인코딩하지만 앱 스킴 dname은 %20 기대).
export function directionsUrl({ lat, lng, name }: DirTarget): string {
  const dname = encodeURIComponent(name)
  const appname = encodeURIComponent(APPNAME)
  return `nmap://route/public?dlat=${lat}&dlng=${lng}&dname=${dname}&appname=${appname}`
}

// 웹 폴백 — 앱 미설치 시 브라우저로. 목적지 좌표/이름을 경로 세그먼트에.
export function directionsWebUrl({ lat, lng, name }: DirTarget): string {
  return `https://map.naver.com/p/directions/-/-/${lng},${lat},${encodeURIComponent(name)}/-/transit`
}

// 앱 스킴 시도 → 일정 시간 내 미전환이면 웹 폴백으로(브라우저 환경에서만 호출).
export function openDirections(target: DirTarget): void {
  if (typeof window === 'undefined') return
  const app = directionsUrl(target)
  const web = directionsWebUrl(target)
  const fallback = window.setTimeout(() => {
    window.location.href = web
  }, 1200)
  window.location.href = app
  // 앱으로 전환되면 페이지가 백그라운드 → pagehide로 폴백 타이머 취소.
  window.addEventListener('pagehide', () => window.clearTimeout(fallback), { once: true })
}
