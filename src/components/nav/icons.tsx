// 로컬 인라인 SVG 아이콘(외부 아이콘 의존성 없이 P0a 자족).
// filled prop으로 활성 상태를 모양으로도 구분(색만 의존 금지, §8 접근성).
export type IconProps = {
  filled?: boolean
  className?: string
  /** 라벨 없는 단독 컨트롤(아이콘 버튼 등)에서 재사용할 때 끌 수 있게. 기본 true(라벨 병기 전제). */
  decorative?: boolean
}

// 치수는 CSS(styles.icon)가, fill은 각 path가 책임진다 → 여기엔 좌표계/스트로크만.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function MapPin({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.4" fill={filled ? 'var(--c-surface)' : 'none'} />
    </svg>
  )
}

export function CalendarDays({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9h17M8 3v3M16 3v3" stroke={filled ? 'var(--c-surface)' : 'currentColor'} />
    </svg>
  )
}

export function Heart({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20Z" />
    </svg>
  )
}

// 장소 탭용 북마크 — Heart는 위시 우선순위·❤️ 리액션의 시그니처라 탭 아이콘과 의미 충돌(§8 '하트≠리액션').
export function Bookmark({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-3.6L5.5 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function Sparkles({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </svg>
  )
}

export function Users({ filled, className, decorative = true }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden={decorative} fill={filled ? 'currentColor' : 'none'}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2A3 3 0 0 1 16 11M20.5 20c0-2.4-1.4-4.2-3.5-4.8" />
    </svg>
  )
}

export type IconComponent = typeof MapPin
