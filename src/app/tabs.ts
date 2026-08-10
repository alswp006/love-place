import type { IconName } from '@/components/ui/Icon'
import type { EmptyArt } from '@/components/common/EmptyState'
import { MapPin, CalendarDays, Suitcase, Bookmark, Users, type IconComponent } from '@/components/nav/icons'

// 5탭 IA의 단일 출처(설계서 §3 — 장소 탭은 지도에 통합, 여행 탭은 '우리'에서 승격). TabBar·router·페이지 셸·테스트가
// 모두 여기서 도출 — 한 곳만 고치면 라우팅·네비·테스트가 동기화된다(메타 중복으로 인한 무성 회귀 방지).
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
  empty: { icon: IconName; art?: EmptyArt; title: string; hint: string; action?: { label: string; to: string } }
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
      icon: 'map',
      art: 'map',
      title: '아직 지도에 표시할 장소가 없어요',
      hint: '아래 시트의 검색창에서 첫 가고싶은 곳을 추가하면 여기 별표로 떠요.',
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
      icon: 'calendar',
      art: 'calendar',
      title: '첫 일정을 만들어볼까요?',
      hint: '나·상대·함께 세 가지 색으로 일정을 겹쳐 봐요.',
      action: { label: '장소부터 모아보기', to: '/' },
    },
  },
  {
    path: '/trips',
    label: '여행',
    testId: 'page-trips',
    title: '여행',
    subtitle: '함께 다녀올 곳 · 다녀온 곳',
    Icon: Suitcase,
    empty: {
      icon: 'luggage',
      art: 'trip',
      title: '아직 만든 여행이 없어요',
      hint: '날짜를 정하면 그날그날 어디를 갈지 담아둘 수 있어요.',
      action: { label: '가고싶은 곳 먼저 모으기', to: '/' },
    },
  },
  {
    // 2026-08: '추천' → '장소'. 추천 탭은 여행지를 발굴하는 곳처럼 이름 지어졌지만, 실제로 하던 일은
    // **담은 장소를 지역으로 묶어 코스를 짜는 것**이었다(설계서 §5.6의 AI 경로도 원래 그 뜻이다).
    // 한편 담은 장소를 보는 유일한 UI가 지도 위 드래그 시트뿐이라, 장소가 쌓이면 '다시 찾기'가
    // 무너졌다(이름으로 검색할 수단이 앱 전체에 없었다). 두 문제의 답이 같은 화면이라 합쳤다:
    // 목록·검색·관리를 여기로 옮기고, 지역이 3곳 이상 모이면 그 자리에서 코스를 짠다.
    path: '/places',
    label: '장소',
    testId: 'page-places',
    title: '장소',
    subtitle: '담은 곳 · 지역별로 모아보기',
    Icon: Bookmark,
    empty: {
      icon: 'sparkles',
      art: 'recommend',
      title: '아직 담은 장소가 없어요',
      hint: '지도에서 가고싶은 곳을 담으면 여기 지역별로 모여요. 한 지역에 3곳이 쌓이면 코스를 짜드려요.',
      action: { label: '가고싶은 곳 추가하기', to: '/' },
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
      icon: 'users',
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
