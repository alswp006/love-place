import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { CtaLink } from '@/components/common/CtaLink'
import { Skeleton } from '@/components/common/Skeleton'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { PlaceList } from '@/components/places/PlaceList'
import { CourseSheet } from '@/components/discover/CourseSheet'
import { useToast } from '@/components/common/ToastProvider'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useVisits, useMarkVisited, useUnmarkVisited } from '@/hooks/useVisits'
import { usePhotosByPlace, useSignedPhotoUrls } from '@/hooks/usePhotos'
import { useSetWishPriority } from '@/hooks/useSetWishPriority'
import { useToggleWish } from '@/hooks/useToggleWish'
import { useDeletePlace, useRestorePlace } from '@/hooks/usePlaceTrash'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import {
  useCollections,
  usePlaceCollections,
  useCreateCollection,
  useRenameCollection,
  useDeleteCollection,
} from '@/hooks/useCollections'
import { useRealtimeCollections } from '@/hooks/useRealtimeCollections'
import { memberPlaceIdSet } from '@/lib/places/collectionFilter'
import { CollectionManager } from '@/components/places/CollectionManager'
import { useEventMutations } from '@/hooks/useEventMutations'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { attachAndSortWishes } from '@/lib/places/wishStatus'
import { filterSaved, type StatusFilter } from '@/lib/places/searchSaved'
import { regionClusters, RECO_THRESHOLD, type RegionCluster } from '@/lib/recommend/regionClusters'
import type { CoursePlace, CourseStop } from '@/lib/route/coursePlan'
import { dayKey } from '@/lib/calendar/eventDays'
import { tabByPath } from '@/app/tabs'
import styles from './PlacesPage.module.css'

// 콜드스타트 시드(데이터 없을 때 죽은 탭 방지, ux §7) — 지도 검색창을 미리 채워 보낸다.
const SEED = [
  { regionLabel: '속초 · 강릉', hint: '바다 · 카페 · 해산물' },
  { regionLabel: '경주', hint: '역사 · 벚꽃 · 황리단길' },
  { regionLabel: '전주', hint: '한옥마을 · 먹거리' },
]

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'wish', label: '가고싶음' },
  { key: 'visited', label: '가봤음' },
]

// 🔖 장소 — 담은 곳을 지역별로 모아 보고, 찾고, 관리하고, 3곳 이상 모인 지역은 그 자리에서 코스를 짠다.
//
// 이 탭이 생긴 이유(2026-08): 담은 장소를 보는 유일한 UI가 지도 위 드래그 시트뿐이었다. 시트는
// 검색 + 목록 + 관리를 한꺼번에 지고 있어서 (a) 상태가 꼬여 지도가 잠기는 버그가 났고 (b) 장소가
// 쌓이면 '다시 찾기'가 아예 불가능했다(이름으로 검색하는 수단이 앱 전체에 없었다).
// 지도는 공간을 보는 곳, 여기는 목록을 다루는 곳으로 가른다.
//
// 옛 '추천' 탭을 대체한다. 추천 탭이 실제로 하던 일(지역 클러스터 → 코스 → 캘린더 일괄 추가)은
// 전부 페이지 밖 라이브러리에 있어서 그대로 승계했다 — CourseSheet·regionClusters·addCourse.
export default function PlacesPage() {
  const tab = tabByPath('/places')
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: visits, isLoading: visitsLoading } = useVisits(coupleId)
  // 지도 탭과 동시에 마운트되지 않는다(라우트가 배타적) — 여기서도 구독해야 상대의 추가가 즉시 보인다.
  useRealtimePlaces(coupleId)
  const { data: collections } = useCollections(coupleId)
  const { data: placeCollections } = usePlaceCollections(coupleId)
  useRealtimeCollections(coupleId)

  const toast = useToast()
  const navigate = useNavigate()
  const conflict = useConflict()

  // 관리 mutation — 이 탭이 '장소를 다루는 곳'이므로 시트가 갖고 있던 것을 그대로 갖춘다.
  const markVisited = useMarkVisited(coupleId, myId)
  const unmarkVisited = useUnmarkVisited(coupleId, myId, conflict.flag)
  const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
  const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
  const { restorePlace } = useRestorePlace(coupleId, myId, conflict.flag)
  const toggleWish = useToggleWish(coupleId, myId, conflict.flag)
  const { addCourse } = useEventMutations(coupleId, myId, () => {})
  // 컬렉션(사용자가 만든 목록) — 지도 시트에서 이 탭으로 옮겨 왔다. 목록을 다루는 곳이 여기다.
  const createCollection = useCreateCollection(coupleId, myId)
  const renameCollection = useRenameCollection(coupleId, myId, conflict.flag)
  const deleteCollection = useDeleteCollection(coupleId, myId, conflict.flag)

  // 사진 썸네일 — 시트와 동일 동작을 유지한다(여기서 빼면 목록이 시트보다 빈약해진다).
  // 알려진 한계: 화면에 보이는 카드가 아니라 커플 전체 사진의 서명 URL을 한 번에 요청한다.
  // 장소가 많아지면 손봐야 하는 자리다(윈도잉 필요).
  const photosByPlace = usePhotosByPlace(coupleId)
  const photoPaths = useMemo(() => {
    const out: string[] = []
    for (const list of photosByPlace.values()) {
      for (const ph of list) out.push(ph.thumbnail_url ?? ph.storage_url)
    }
    return out
  }, [photosByPlace])
  const { data: photoUrls } = useSignedPhotoUrls(coupleId, photoPaths)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [collId, setCollId] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [sheet, setSheet] = useState<{ regionLabel: string; places: CoursePlace[] } | null>(null)
  // 코스 미리보기 기본 날짜 = 내일. 확인을 눌러야 캘린더에 쓴다.
  const defaultDate = dayKey(new Date(Date.now() + 86_400_000).toISOString())

  const enriched = useMemo(
    () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
    [places, wishes, myId],
  )
  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
  // 삭제된 컬렉션을 가리키고 있으면 전체로 폴백(칩이 사라졌는데 필터만 남는 일 방지).
  const effectiveCollId =
    collId && (collections ?? []).some((c) => c.id === collId) ? collId : null
  const collMembers = useMemo(
    () => (effectiveCollId ? memberPlaceIdSet(placeCollections ?? [], effectiveCollId) : null),
    [effectiveCollId, placeCollections],
  )
  // 세 축(상태 × 컬렉션 × 질의)이 전부 **곱해진다**. 지도 시트는 컬렉션이 상태를 덮어쓰는 배타
  // 구조라 "가본 곳 중에 속초"도, "이 목록 중에 카페"도 표현할 수 없었다.
  const filtered = useMemo(() => {
    const byColl = collMembers ? enriched.filter((p) => collMembers.has(p.id)) : enriched
    return filterSaved(byColl, { status, query, visitedIds })
  }, [enriched, collMembers, status, query, visitedIds])
  // 지역 그룹 — region_code는 DB에서 항상 NULL이라 사실상 region_label 문자열 그룹핑이다.
  const clusters = useMemo(() => regionClusters(filtered), [filtered])
  const byId = useMemo(() => new Map(filtered.map((p) => [p.id, p])), [filtered])

  const hasAnyPlace = (places ?? []).length > 0

  // 클러스터 → 코스 미리보기(즉시 쓰기 안 함). 좌표 있는 곳만, 최대 6곳.
  const openCourse = (cluster: RegionCluster) => {
    const coursePlaces = cluster.placeIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => typeof p?.lat === 'number' && typeof p?.lng === 'number')
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number }))
    if (coursePlaces.length < 2) {
      toast.show('좌표가 있는 장소가 2곳 이상 필요해요')
      return
    }
    setSheet({ regionLabel: cluster.regionLabel, places: coursePlaces })
  }

  const onConfirmCourse = async (v: { stops: CourseStop[]; dayKeyStr: string; startMin: number }) => {
    try {
      const r = await addCourse.mutateAsync(v)
      setSheet(null)
      toast.show(r.status === 'exists' ? '이미 추가된 코스예요 · 캘린더에서 볼게요' : '함께 캘린더에 추가했어요!')
      navigate(`/calendar?date=${v.dayKeyStr}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '추가에 실패했어요')
    }
  }

  if (!coupleLoading && couple?.status !== 'ACTIVE') {
    return (
      <ScreenScaffold title={tab.title} testId={tab.testId} headerHidden>
        <EmptyState
          icon="users"
          title="먼저 상대와 연결해요"
          hint="'우리' 탭에서 연결하면, 둘이 모은 장소가 여기 모여요."
        />
      </ScreenScaffold>
    )
  }

  // 로딩 중엔 빈 상태 대신 스켈레톤(콜드스타트 플래시 방지 — 로딩을 '장소 없음'으로 오판하지 않게).
  if (placesLoading || visitsLoading) {
    return (
      <ScreenScaffold title={tab.title} testId={tab.testId} headerHidden>
        <Skeleton count={3} label="담은 장소 불러오는 중" />
      </ScreenScaffold>
    )
  }

  return (
    <ScreenScaffold title={tab.title} testId={tab.testId} headerHidden>
      <div className={styles.container} data-testid="places-page">
        {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

        {hasAnyPlace ? (
          <>
            {/* 담은 장소를 '다시 찾는' 검색 — 지도 상단 검색창(새 장소 발견)과 목적이 다르다. */}
            <div className={styles.searchRow}>
              <label className={styles.searchLabel} htmlFor="places-search">
                담은 장소 검색
              </label>
              <input
                id="places-search"
                type="search"
                className={styles.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 · 지역 · 카테고리로 찾기"
                autoComplete="off"
              />
            </div>

            <div className={styles.filterRow} role="group" aria-label="장소 필터">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`${styles.filterChip} ${status === f.key ? styles.filterOn : ''}`}
                  aria-pressed={status === f.key}
                  onClick={() => setStatus(f.key)}
                >
                  {f.label}
                </button>
              ))}
              {/* 사용자 목록 칩 — 상태 칩을 덮어쓰지 않고 **함께** 걸린다(교차 필터). */}
              {(collections ?? []).map((c) => {
                const on = effectiveCollId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.filterChip} ${on ? styles.filterOn : ''}`}
                    aria-pressed={on}
                    onClick={() => setCollId(on ? null : c.id)}
                  >
                    {c.name}
                  </button>
                )
              })}
              <button
                type="button"
                className={styles.manageChip}
                aria-label="목록 관리"
                onClick={() => setManagerOpen(true)}
              >
                ＋ 목록
              </button>
              <span className={styles.count}>{filtered.length}곳</span>
            </div>
          </>
        ) : null}

        {/* 지역 그룹 — 3곳 이상 모인 지역에는 그 자리에 코스 CTA가 붙는다. */}
        {clusters.map((c) => {
          const groupPlaces = c.placeIds
            .map((id) => byId.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p))
          return (
            <section
              key={c.regionCode ?? `label:${c.regionLabel}`}
              className={styles.group}
              aria-label={`${c.regionLabel} ${c.count}곳`}
              data-testid={`region-group-${c.regionLabel}`}
            >
              <header className={styles.groupHead}>
                <h2 className={styles.groupTitle}>
                  {c.regionLabel} <span className={styles.groupCount}>{c.count}곳</span>
                </h2>
                {c.ready ? (
                  <Button
                    variant="cta"
                    className={styles.courseBtn}
                    onClick={() => openCourse(c)}
                    disabled={addCourse.isPending}
                    data-testid="reco-build-course"
                  >
                    <Icon name="calendar" /> 코스 짜기
                  </Button>
                ) : (
                  // 색만으로 말하지 않는다 — 몇 곳이 더 필요한지 글자로 알린다(§8).
                  <p className={styles.building}>{RECO_THRESHOLD - c.count}곳 더 모으면 코스를 짜드려요</p>
                )}
              </header>

              <PlaceList
                photosByPlace={photosByPlace}
                photoUrls={photoUrls}
                visible={groupPlaces}
                wishes={wishes}
                visitedIds={visitedIds}
                placesLoading={false}
                placeFilter={status}
                selectedId={null}
                // 카드를 누르면 지도에서 그 장소를 연다(딥링크) — 여기선 위치를 못 보여주므로.
                onSelect={(id) => navigate(`/?place=${id}`)}
                setPriority={setPriority}
                priorityPending={priorityPending}
                onToggleWish={(placeId) =>
                  toggleWish.mutate(
                    { placeId },
                    { onError: (e) => toast.show(e instanceof Error ? e.message : '찜하지 못했어요.') },
                  )
                }
                markVisited={markVisited}
                onUnvisit={(placeId) =>
                  unmarkVisited.mutate(
                    { placeId },
                    {
                      onSuccess: (r) => {
                        if (r.status === 'noop') toast.show('이미 취소된 기록이에요')
                      },
                    },
                  )
                }
                unvisitPending={unmarkVisited.isPending}
                deletePlace={deletePlace}
                deletePending={deletePending}
                onToast={toast.show}
                onToastAction={toast.show}
                restorePlace={restorePlace}
              />
            </section>
          )
        })}

        {/* 담은 건 있는데 필터·검색 결과가 0 — '장소 없음'과 구분되는 부분 빈 상태(ux §7). */}
        {hasAnyPlace && clusters.length === 0 ? (
          <EmptyState
            icon="search"
            title="조건에 맞는 장소가 없어요"
            hint="검색어를 지우거나 다른 필터를 눌러보세요."
          />
        ) : null}

        {!hasAnyPlace ? (
          <section aria-label="첫 장소 담기">
            <EmptyState icon={tab.empty.icon} art={tab.empty.art} title={tab.empty.title} hint={tab.empty.hint} />
            <CtaLink to="/">가고싶은 곳 추가하기</CtaLink>
            <h2 className={styles.seedTitle}>이런 여행은 어때요?</h2>
            {SEED.map((s) => (
              <CtaLink key={s.regionLabel} to={`/?q=${encodeURIComponent(s.regionLabel)}`}>
                ✨ {s.regionLabel} · {s.hint}
              </CtaLink>
            ))}
          </section>
        ) : null}

        <CollectionManager
          open={managerOpen}
          onClose={() => setManagerOpen(false)}
          collections={collections ?? []}
          onCreate={(name) => createCollection.mutate({ name })}
          onRename={(id, version, name) => renameCollection.mutate({ id, version, name })}
          onDelete={(id, version) => deleteCollection.mutate({ id, version })}
          busy={createCollection.isPending || renameCollection.isPending || deleteCollection.isPending}
        />

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
