import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { CtaLink } from '@/components/common/CtaLink'
import { Skeleton } from '@/components/common/Skeleton'
import { CourseSheet } from '@/components/discover/CourseSheet'
import { useToast } from '@/components/common/ToastProvider'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useVisits } from '@/hooks/useVisits'
import { useEventMutations } from '@/hooks/useEventMutations'
import { regionClusters, RECO_THRESHOLD, type RegionCluster } from '@/lib/recommend/regionClusters'
import type { CoursePlace, CourseStop } from '@/lib/route/coursePlan'
import { dayKey } from '@/lib/calendar/eventDays'
import { tabByPath } from '@/app/tabs'
import styles from './RecommendPage.module.css'

// 콜드스타트 시드(데이터 없을 때 죽은 탭 방지, ux §7).
const SEED = [
  { regionLabel: '속초 · 강릉', hint: '바다 · 카페 · 해산물' },
  { regionLabel: '경주', hint: '역사 · 벚꽃 · 황리단길' },
  { regionLabel: '전주', hint: '한옥마을 · 먹거리' },
]

// ✨ 추천 — 같은 지역 가고싶은 곳이 모이면 코스 후보(§5.6). "함께 캘린더에 추가"는 결정론 동선으로(AI 없이도 동작).
export default function RecommendPage() {
  const tab = tabByPath('/discover')
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
  const { data: visits, isLoading: visitsLoading } = useVisits(coupleId)
  const toast = useToast()
  const navigate = useNavigate()
  const { addCourse } = useEventMutations(coupleId, myId, () => {}) // 코스 일괄 추가(멱등)
  const [sheet, setSheet] = useState<{ regionLabel: string; places: CoursePlace[] } | null>(null)
  // 다음날 기본(코스 미리보기 기본 날짜). 확인 시에만 캘린더에 쓴다.
  const defaultDate = dayKey(new Date(Date.now() + 86_400_000).toISOString())

  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
  const wantClusters = useMemo(
    () => regionClusters((places ?? []).filter((p) => !visitedIds.has(p.id))),
    [places, visitedIds],
  )
  const visitedClusters = useMemo(
    () => regionClusters((places ?? []).filter((p) => visitedIds.has(p.id))),
    [places, visitedIds],
  )
  const nameById = useMemo(
    () => Object.fromEntries((places ?? []).map((p) => [p.id, p.name])) as Record<string, string>,
    [places],
  )
  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places])

  const ready = wantClusters.filter((c) => c.ready)
  const building = wantClusters.filter((c) => !c.ready)
  const hasAnyPlace = (places ?? []).length > 0

  // 클러스터 → 코스 미리보기 시트 열기(즉시 쓰기 안 함). 좌표 있는 곳 ≤6.
  const openCourse = (cluster: RegionCluster) => {
    if (!coupleId || !myId) return
    const coursePlaces = cluster.placeIds
      .map((id) => placeById.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p) && typeof p?.lat === 'number' && typeof p?.lng === 'number')
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number }))
    if (coursePlaces.length < 2) {
      toast.show('좌표가 있는 장소가 2곳 이상 필요해요')
      return
    }
    setSheet({ regionLabel: cluster.regionLabel, places: coursePlaces })
  }

  // 확인 시에만 캘린더에 추가(멱등) → 그 날짜로 점프. exists면 안내만.
  const onConfirmCourse = async (v: { stops: CourseStop[]; dayKeyStr: string; startMin: number }) => {
    try {
      const r = await addCourse.mutateAsync(v)
      setSheet(null)
      if (r.status === 'exists') toast.show('이미 추가된 코스예요 · 캘린더에서 볼게요')
      else toast.show('함께 캘린더에 추가했어요!')
      navigate(`/calendar?date=${v.dayKeyStr}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '추가에 실패했어요')
    }
  }

  if (!coupleLoading && couple?.status !== 'ACTIVE') {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <EmptyState
          emoji="💑"
          title="먼저 상대와 연결해요"
          hint="'우리' 탭에서 연결하면, 둘이 모은 장소로 코스를 추천해요."
        />
      </ScreenScaffold>
    )
  }

  // 콜드스타트 플래시 제거(Task 9): 데이터 로딩 중엔 빈 상태/SEED 대신 추천 카드 자리 스켈레톤.
  if (placesLoading || visitsLoading) {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <Skeleton count={3} label="추천 불러오는 중" />
      </ScreenScaffold>
    )
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        {ready.length > 0 ? (
          <section aria-label="코스 추천">
            <h2 className={styles.sectionTitle}>코스 짜기 좋은 지역</h2>
            {ready.map((c) => (
              <ReadyCard
                key={c.regionCode ?? 'label:' + c.regionLabel}
                cluster={c}
                nameById={nameById}
                busy={addCourse.isPending}
                onAddCourse={openCourse}
              />
            ))}
          </section>
        ) : null}

        {building.length > 0 ? (
          <section aria-label="모으는 중">
            <h2 className={styles.sectionTitle}>조금만 더!</h2>
            {building.map((c) => (
              <p key={c.regionCode ?? 'label:' + c.regionLabel} className={styles.building}>
                <strong>{c.regionLabel}</strong> {c.count}곳 — {RECO_THRESHOLD - c.count}곳 더 모으면 코스를 짜드려요
              </p>
            ))}
          </section>
        ) : null}

        {visitedClusters.length > 0 ? (
          <section aria-label="다시 가보기">
            <h2 className={styles.sectionTitle}>다시 가보기</h2>
            {visitedClusters.slice(0, 3).map((c) => (
              <p key={c.regionCode ?? 'label:' + c.regionLabel} className={styles.retro} aria-disabled="true">
                📷 지난 <strong>{c.regionLabel}</strong> {c.count}곳 다시 보기 ·{' '}
                <span className={styles.soonBadge}>곧 제공</span>
              </p>
            ))}
          </section>
        ) : null}

        {!hasAnyPlace ? (
          <section aria-label="추천 시작">
            <EmptyState
              emoji="✨"
              title="같은 지역 가고싶은 곳이 모이면 추천이 시작돼요"
              hint={`한 지역에 ${RECO_THRESHOLD}곳이 쌓이면 코스를 제안해요.`}
            />
            <CtaLink to="/">가고싶은 곳 추가하기</CtaLink>
            <h2 className={styles.sectionTitle}>이런 여행은 어때요?</h2>
            {SEED.map((s) => (
              <CtaLink key={s.regionLabel} to={`/?q=${encodeURIComponent(s.regionLabel)}`}>
                ✨ {s.regionLabel} · {s.hint}
              </CtaLink>
            ))}
          </section>
        ) : null}

        {sheet ? (
          <CourseSheet
            regionLabel={sheet.regionLabel}
            places={sheet.places}
            defaultDate={defaultDate}
            busy={addCourse.isPending}
            onCancel={() => setSheet(null)}
            onConfirm={onConfirmCourse}
          />
        ) : null}
      </div>
    </ScreenScaffold>
  )
}

function ReadyCard({
  cluster,
  nameById,
  busy,
  onAddCourse,
}: {
  cluster: RegionCluster
  nameById: Record<string, string>
  busy: boolean
  onAddCourse: (c: RegionCluster) => void
}) {
  const names = cluster.placeIds
    .map((id) => nameById[id])
    .filter((n): n is string => Boolean(n))
    .slice(0, 5)
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <strong>{cluster.regionLabel}</strong>
        <span className={styles.count}>{cluster.count}곳</span>
      </div>
      <p className={styles.names}>{names.join(' · ')}</p>
      <button type="button" className={styles.courseBtn} onClick={() => onAddCourse(cluster)} disabled={busy}>
        🗓️ 함께 일정 만들기
      </button>
      <p className={styles.soon}>거리순 자동 동선으로 내일 일정에 추가돼요 (AI 코스는 배포 후)</p>
    </div>
  )
}
