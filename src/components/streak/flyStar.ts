// 완료 체크 → 별이 날아가 박힌다.
//
// 왜 React 상태가 아니라 DOM 함수인가: 출발점(체크박스)과 도착점(별자리의 다음 자리)이
// 서로 다른 컴포넌트 트리에 있고, 둘 다 '지금 화면에서의 좌표'가 필요하다. 상태로 올리면
// 좌표를 위로 들어 올리는 배선이 캘린더 전체에 번진다. 여기서는 잠깐 떠서 사라지는
// 장식이므로 렌더 트리 밖에 두는 편이 정직하다.
//
// Reduce Motion에서는 아무것도 하지 않는다(ux §5) — 결과(별이 늘어난 것)는 어차피 보인다.

export const STAR_TARGET_ID = 'streak-star-target'

const DURATION = 620

export function flyStar(from: Element | null): void {
  if (typeof document === 'undefined' || !from) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const target = document.getElementById(STAR_TARGET_ID)
  if (!target) return // 별자리가 접혀 있으면 날릴 곳이 없다 — 조용히 지나간다.

  const a = from.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  if (a.width === 0 || b.width === 0) return

  const dot = document.createElement('div')
  dot.setAttribute('aria-hidden', 'true')
  Object.assign(dot.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'var(--c-brand)',
    boxShadow: '0 0 8px 2px var(--c-brand-weak)',
    pointerEvents: 'none',
    zIndex: '90',
  })
  document.body.appendChild(dot)

  const x0 = a.left + a.width / 2 - 5
  const y0 = a.top + a.height / 2 - 5
  const x1 = b.left + b.width / 2 - 5
  const y1 = b.top + b.height / 2 - 5
  // 살짝 위로 솟았다 내려앉는 호 — 직선으로 가면 '날아간다'로 안 읽힌다.
  const xm = (x0 + x1) / 2
  const ym = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.18 - 24

  const anim = dot.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0.9, offset: 0 },
      { transform: `translate(${xm}px, ${ym}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.35)`, opacity: 0, offset: 1 },
    ],
    { duration: DURATION, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
  )
  anim.onfinish = () => dot.remove()
  anim.oncancel = () => dot.remove()
}
