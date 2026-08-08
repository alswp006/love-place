import {
  AlertTriangle,
  Bell,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  CornerDownLeft,
  Heart,
  Hourglass,
  Image as ImageIcon,
  Map as MapIcon,
  MapPin,
  MoreHorizontal,
  Plus,
  Repeat,
  Route,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import styles from './Icon.module.css'

// 아이콘 세트 — Lucide를 우리 규약으로 감싼 얇은 어댑터.
//
// 직접 그리던 것을 라이브러리로 바꾼 이유: 손으로 그린 십여 개는 곡률·여백·시각 무게가
// 미묘하게 어긋나 모아 놓으면 세트로 안 읽혔다. Lucide는 같은 규약(24 그리드, stroke 기반,
// round cap)으로 그려진 완성된 세트라 무엇을 더 꺼내 써도 톤이 유지된다.
// ESM tree-shaking이라 쓰는 것만 번들에 들어가고, 인라인 SVG라 CSP에도 걸리지 않는다.
//
// 규약(전부 지킬 것 — 안 지키면 세트가 다시 들쭉날쭉해진다):
//  - 색은 currentColor(부모 색을 따름), 크기는 1em(부모 글자 크기를 따름 — Dynamic Type §4)
//  - stroke-width 1.75(Lucide 기본 2보다 살짝 얇게 — 우리 타이포가 가벼운 편)
//  - 기본 aria-hidden. 아이콘만으로 뜻을 전하는 자리에서는 label을 주면 img role로 바뀐다(§4)
//
// 이모지를 걷어낸 이유: OS·버전마다 모양·굵기·여백이 달라 통제가 안 되고, 한 화면에
// 이모지와 SVG 두 체계가 섞였다. 하나로 통일한다.

const SET = {
  repeat: Repeat,
  bell: Bell,
  check: Check,
  'check-circle': CheckCircle2,
  trash: Trash2,
  pin: MapPin,
  heart: Heart,
  sparkles: Sparkles,
  plus: Plus,
  close: X,
  more: MoreHorizontal,
  enter: CornerDownLeft,
  calendar: Calendar,
  luggage: Briefcase,
  map: MapIcon,
  image: ImageIcon,
  clock: Clock,
  // 이모지를 대신하려고 새로 꺼낸 것들
  compass: Compass,
  route: Route,
  ruler: Ruler,
  users: Users,
  search: Search,
  camera: Camera,
  chevron: ChevronDown,
  warning: AlertTriangle,
  waiting: Hourglass,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof SET

type Props = {
  name: IconName
  /** 아이콘만으로 뜻을 전할 때만 준다 — 옆에 같은 뜻의 글자가 있으면 주지 말 것(중복 낭독). */
  label?: string
  className?: string
}

export function Icon({ name, label, className }: Props) {
  const Glyph = SET[name]
  const cls = className ? `${styles.icon} ${className}` : styles.icon
  return (
    <Glyph
      className={cls}
      /* 어떤 아이콘인지 테스트·디버깅에서 식별하기 위한 훅. 아이콘은 기본 aria-hidden이라
         접근 이름이 없다 — 대신 이걸로 '무엇이 그려졌는지'를 검증한다. */
      data-icon={name}
      /* 크기는 CSS(1em)가 정한다 — Lucide 기본 size=24가 인라인 width/height로 박히면
         부모 글자 크기를 못 따라가 Dynamic Type에서 홀로 안 커진다. */
      size={undefined}
      absoluteStrokeWidth
      strokeWidth={1.75}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    />
  )
}
