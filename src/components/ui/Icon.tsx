import styles from './Icon.module.css'

// 아이콘 세트 — 인라인 SVG. 라이브러리를 넣지 않은 이유: 쓰는 게 십여 개뿐이라
// 의존성·번들 증가 없이 직접 두는 편이 낫고, 굵기·좌표계를 우리가 통제할 수 있다.
//
// 규약(전부 지킬 것 — 안 지키면 세트가 다시 들쭉날쭉해진다):
//  - viewBox 0 0 24 24, stroke 기반, stroke-width 1.75, 선 끝/이음 round
//  - 색은 currentColor(부모 색을 따름), 크기는 1em(부모 글자 크기를 따름 — Dynamic Type §4)
//  - 기본 aria-hidden. 아이콘만으로 뜻을 전하는 자리에서는 label을 주면 img role로 바뀐다(§4)
//
// 이모지를 걷어낸 이유: OS·버전마다 모양·굵기·여백이 달라 통제가 안 되고, 탭바만 SVG라
// 한 화면에서 두 체계가 섞였다. 하나로 통일한다.

export type IconName =
  | 'repeat'
  | 'bell'
  | 'check'
  | 'check-circle'
  | 'trash'
  | 'pin'
  | 'heart'
  | 'sparkles'
  | 'plus'
  | 'close'
  | 'more'
  | 'enter'
  | 'calendar'
  | 'luggage'
  | 'map'
  | 'image'
  | 'clock'

const PATHS: Record<IconName, React.ReactNode> = {
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  heart: <path d="M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7-.6c0 5-7 12.6-7 12.6z" />,
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  enter: (
    <>
      <path d="M20 5v6a3 3 0 0 1-3 3H4" />
      <path d="M8 10l-4 4 4 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  luggage: (
    <>
      <rect x="4" y="7" width="16" height="14" rx="2.5" />
      <path d="M9 7V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z" />
      <path d="M9 4v13" />
      <path d="M15 7v13" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-7 8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
}

type Props = {
  name: IconName
  /** 아이콘만으로 뜻을 전할 때만 준다 — 옆에 같은 뜻의 글자가 있으면 주지 말 것(중복 낭독). */
  label?: string
  className?: string
}

export function Icon({ name, label, className }: Props) {
  const cls = className ? `${styles.icon} ${className}` : styles.icon
  return (
    <svg
      className={cls}
      /* 어떤 아이콘인지 테스트·디버깅에서 식별하기 위한 훅. 이모지였을 땐 글자로 단언했지만
         SVG는 aria-hidden이라 접근 이름이 없다 — 대신 이걸로 '무엇이 그려졌는지'를 검증한다. */
      data-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
