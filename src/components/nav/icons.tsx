// 로컬 인라인 SVG 아이콘(외부 아이콘 의존성 없이 P0a 자족).
// filled prop으로 활성 상태를 모양으로도 구분(색만 의존 금지, §8 접근성).
export type IconProps = {
  filled?: boolean
  className?: string
}

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function MapPin({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.4" fill={filled ? 'var(--c-surface)' : 'none'} />
    </svg>
  )
}

export function CalendarDays({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9h17M8 3v3M16 3v3" stroke={filled ? 'var(--c-surface)' : 'currentColor'} />
    </svg>
  )
}

export function Heart({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20Z" />
    </svg>
  )
}

export function Sparkles({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </svg>
  )
}

export function Users({ filled, className }: IconProps) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2A3 3 0 0 1 16 11M20.5 20c0-2.4-1.4-4.2-3.5-4.8" />
    </svg>
  )
}

export type IconComponent = typeof MapPin
