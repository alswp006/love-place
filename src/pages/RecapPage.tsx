import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCouple } from '@/hooks/useCouple'
import { useTripRecap } from '@/hooks/useTripRecap'
import { useSnappedPolyline } from '@/hooks/useSnappedPolyline'
import { usePlaces } from '@/hooks/usePlaces'
import { NaverMap } from '@/components/map/NaverMap'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { RecapShareButton } from '@/components/recap/RecapShareButton'
import styles from './RecapPage.module.css'

// 여행 리캡(R5 P-B) — 방문 장소를 시간순으로 이은 측지선 동선 + 3-스탯 + 정거장 목록 + 기기 내 공유.
// read-side(useTripRecap). 사진/정거장 리액션은 해당 피처 미구현으로 제외(후속).
export default function RecapPage() {
  const navigate = useNavigate()
  const { tripId } = useParams<{ tripId: string }>()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { trip, vertices, stats, isLoading } = useTripRecap(coupleId, tripId)
  const { data: allPlaces } = usePlaces(coupleId)

  const stopIds = useMemo(() => new Set(vertices.map((v) => v.placeId)), [vertices])
  const markerPlaces = useMemo(
    () => (allPlaces ?? []).filter((p) => stopIds.has(p.id)),
    [allPlaces, stopIds],
  )
  const geodesic = useMemo(() => vertices.map((v) => ({ lat: v.lat, lng: v.lng })), [vertices])
  // 프로그레시브: 측지선 즉시 렌더 → 도로 스냅 도착 시 덮어쓰기(미배포/실패면 측지선 유지).
  const snapped = useSnappedPolyline(coupleId, tripId, vertices)
  const linePolyline = snapped.polyline ?? geodesic
  const distKm = snapped.roadDistanceKm ?? stats.distanceKm
  const distLabel = snapped.roadDistanceKm != null ? '도로' : '장소→장소'

  const period =
    trip && trip.start_date && trip.end_date
      ? `${trip.start_date} ~ ${trip.end_date}`
      : ''

  return (
    <section className={styles.wrap} aria-label="여행 리캡" data-testid="page-recap">
      <header className={styles.header}>
        <Button variant="ghost" onClick={() => navigate(-1)} aria-label="뒤로">
          ← 뒤로
        </Button>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{trip?.title ?? '여행 리캡'}</h1>
          {period ? <p className={styles.period}>{period}</p> : null}
        </div>
        {trip && vertices.length > 0 ? (
          <RecapShareButton title={trip.title} stats={stats} vertices={vertices} />
        ) : (
          <span className={styles.headerSpacer} aria-hidden />
        )}
      </header>

      {isLoading ? (
        <div className={styles.body}>
          <Skeleton count={3} label="리캡 불러오는 중" />
        </div>
      ) : !trip ? (
        <div className={styles.body}>
          <EmptyState
            emoji="🧭"
            title="여행을 찾을 수 없어요"
            hint="추천 탭의 '지난 여행'에서 다시 골라주세요."
            action={
              <Button variant="primary" onClick={() => navigate('/discover')}>
                추천으로 가기
              </Button>
            }
          />
        </div>
      ) : vertices.length === 0 ? (
        <div className={styles.body}>
          <EmptyState
            emoji="🗺️"
            title="이 여행엔 아직 동선이 없어요"
            hint="가본 장소를 이 여행에 연결하면 동선이 그려져요."
          />
        </div>
      ) : (
        <>
          {isNaverMapConfigured() ? (
            <div className={styles.mapWrap}>
              <NaverMap
                places={markerPlaces}
                visitedIds={stopIds}
                snap="full"
                polyline={linePolyline}
              />
            </div>
          ) : null}

          {/* 3-스탯 — 색만 의존 금지(아이콘+텍스트). 거리는 '장소→장소'로 정직 표기(측지선). */}
          <div className={styles.stats} role="group" aria-label="여행 요약">
            <Chip tone="pink">📍 장소 {stats.stopCount}곳</Chip>
            <Chip tone="neutral">📏 {distKm}km({distLabel})</Chip>
            <Chip tone="neutral">🗓️ {stats.days}일</Chip>
          </div>

          {/* 순서 정거장 목록 — 번호+이름+날짜+지역 */}
          <ol className={styles.stops} aria-label="정거장 순서">
            {vertices.map((v, i) => (
              <Card as="li" key={v.visitId} className={styles.stop}>
                <span className={styles.stopNum} aria-hidden>
                  {i + 1}
                </span>
                <div className={styles.stopBody}>
                  <span className={styles.stopName}>{v.name}</span>
                  <span className={styles.stopMeta}>
                    {[v.visitDate, v.regionLabel].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </Card>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
