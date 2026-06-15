// HTML 이스케이프 유틸 — 순수 함수(테스트로 못박음). 마커 라벨/클러스터/프리뷰 마커 등
// 지도 위 주입 HTML에서 사용자 텍스트를 이스케이프(XSS 방어). InfoWindow 말풍선은 React 시트로 대체(Task 12).
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
