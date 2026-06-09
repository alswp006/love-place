import { MapPin, CalendarDays, Bookmark, Sparkles, Users, type IconComponent } from '@/components/nav/icons'

// 5탭 IA의 단일 출처(설계서 §3). TabBar·router·페이지 셸·테스트가 모두 여기서 도출 —
// 한 곳만 고치면 라우팅·네비·테스트가 동기화된다(메타 중복으로 인한 무성 회귀 방지).
export type TabDef = {
  /** 라우트 경로(절대) */
  path: string
  /** index 라우트 여부(NavLink end) */
  index?: boolean
  /** 하단 탭바 라벨 */
  label: string
  /** 페이지 testId */
  testId: string
  /** 라지 타이틀(= label과 같게 유지) */
  title: string
  subtitle: string
  Icon: IconComponent
  /** 빈 상태 카피 + (선택) 행동 유도 CTA — 죽은 탭 금지(§7/§5.6) */
  empty: { emoji: string; title: string; hint: string; action?: { label: string; to: string } }
}

export const TABS: TabDef[] = [
  {
    path: '/',
    index: true,
    label: '지도',
    testId: 'page-map',
    title: '지도',
    subtitle: '우리가 가고 싶은 곳과 가봤던 곳',
    Icon: MapPin,
    empty: {
      emoji: '🗺️',
      title: '아직 지도에 표시할 장소가 없어요',
      hint: '장소 탭에서 첫 가고싶은 곳을 추가하면 여기 별표로 떠요.',
      action: { label: '장소 모으러 가기', to: '/places' },
    },
  },
  {
    path: '/calendar',
    label: '일정',
    testId: 'page-calendar',
    title: '일정',
    subtitle: '나 · 상대 · 함께',
    Icon: CalendarDays,
    empty: {
      emoji: '📅',
      title: '첫 일정을 만들어볼까요?',
      hint: '나·상대·함께 세 가지 색으로 일정을 겹쳐 봐요.',
      action: { label: '장소부터 모아보기', to: '/places' },
    },
  },
  {
    path: '/places',
    label: '장소',
    testId: 'page-places',
    title: '장소',
    subtitle: '가고싶은 곳 · 가본 곳',
    Icon: Bookmark,
    empty: {
      emoji: '📍',
      title: '첫 가고싶은 장소를 추가해보세요',
      hint: '검색 한 줄이면 끝 — 이름·주소·좌표가 한 번에 저장돼요.',
    },
  },
  {
    path: '/discover',
    label: '추천',
    testId: 'page-discover',
    title: '추천',
    subtitle: '모이면 코스를 짜드려요',
    Icon: Sparkles,
    empty: {
      emoji: '✨',
      title: '같은 지역 가고싶은 곳이 모이면 추천이 시작돼요',
      hint: '한 지역에 3~5곳이 쌓이면 AI가 일자별 코스를 제안해요.',
      action: { label: '가고싶은 곳 추가하기', to: '/places' },
    },
  },
  {
    path: '/us',
    label: '우리',
    testId: 'page-us',
    title: '우리',
    subtitle: '프로필 · 연결 · 내보내기',
    Icon: Users,
    empty: {
      emoji: '💑',
      title: '상대를 초대해 연결해요',
      hint: '1회용 초대 코드로 둘만 안전하게 연결돼요. (곧 추가됩니다)',
    },
  },
]

/** 경로로 탭 def를 찾는다(페이지 셸이 자기 def를 도출할 때 사용). */
export function tabByPath(path: string): TabDef {
  const tab = TABS.find((t) => t.path === path)
  if (!tab) throw new Error(`Unknown tab path: ${path}`)
  return tab
}
