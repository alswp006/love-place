import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useTrips } from '@/hooks/useTrips'
import { useEvents } from '@/hooks/useEvents'
import { usePlaces, type PlaceRow } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useEventMutations } from '@/hooks/useEventMutations'
import { useSoftDeleteWithUndo } from '@/hooks/useTrash'
import { useProfiles } from '@/hooks/useProfiles'
import { useVisits, useSaveVisitReview, type VisitRow } from '@/hooks/useVisits'
import { useConflict } from '@/lib/sync/useConflict'
import { useToast } from '@/components/common/ToastProvider'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { TripDaySection } from '@/components/trips/TripDaySection'
import { localDayKey } from '@/lib/journey/autoLink'
import { tripDays, tripPhase, tripPhaseLabel } from '@/lib/trips/tripDays'
import styles from './TripDetailPage.module.css'

// 🧳 여행 상세 — Day를 세로로 이어 붙인 계획(트리플식 흐름).
// 계획을 여행에 따로 저장하지 않는다: Day N의 스톱 = 그 날짜에 든 events 중 place_id가 있는 것,
// 메모 = place_id가 없는 것(CLAUDE.md §7). 캘린더 탭과 같은 데이터를 다른 렌즈로 본다.

export default function TripDetailPage() {
  const navigate = useNavigate()
  const { tripId } = useParams<{ tripId: string }>()
  const { user } = useAuth()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const myId = user?.id ?? null

  const { data: trips, isLoading: tripsLoading } = useTrips(coupleId)
  const { data: events } = useEvents(coupleId)
  const { data: places } = usePlaces(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: profiles } = useProfiles(coupleId)
  const { data: visits } = useVisits(coupleId)
  const conflict = useConflict()
  const toast = useToast()
  const { create } = useEventMutations(coupleId, myId, conflict.flag)
  // 리뷰 저장 — 내 visits 행의 rating/memo를 version 조건부로 고친다(없으면 이 여행으로 insert).
  const saveReview = useSaveVisitReview(coupleId, myId, conflict.flag)
  // 스톱 빼기 = events soft-delete. 캘린더·방문·여행·장소가 전부 쓰는 공용 훅으로 통일해
  // "1탭 확인 → 2탭 삭제 + 되돌리기 토스트" 계약을 화면 간에 맞춘다(이전엔 여기만 1탭 즉시 삭제였다).
  const { deleteWithUndo, isPending: removing } = useSoftDeleteWithUndo(
    'events',
    coupleId,
    myId,
    conflict.flag,
  )

  const trip = useMemo(() => (trips ?? []).find((t) => t.id === tripId) ?? null, [trips, tripId])
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip])
  const today = localDayKey()

  const placeById = useMemo(() => {
    const m = new Map<string, PlaceRow>()
    for (const p of places ?? []) m.set(p.id, p)
    return m
  }, [places])

  // 찜한 장소 id 집합 — Day 섹션이 '이 날에 아직 없는 후보'를 고를 때 쓴다.
  // 위시는 여행 전체에서 한 번만 읽고, Day별 걸러내기는 각 섹션이 한다.
  // 장소별 방문행 — 리뷰는 '각자의 것'이라 한 장소에 둘의 행이 함께 온다.
  const visitsByPlace = useMemo(() => {
    const m = new Map<string, VisitRow[]>()
    for (const v of visits ?? []) {
      const list = m.get(v.place_id)
      if (list) list.push(v)
      else m.set(v.place_id, [v])
    }
    return m
  }, [visits])

  const wishedIds = useMemo(
    () => new Set(Object.keys(wishes?.byPlace ?? {})),
    [wishes],
  )

  if (tripsLoading) {
    return (
      <section className={styles.wrap} aria-label="여행 상세" data-testid="page-trip-detail">
        <Skeleton count={4} label="여행 불러오는 중" />
      </section>
    )
  }

  if (!trip) {
    return (
      <section className={styles.wrap} aria-label="여행 상세" data-testid="page-trip-detail">
        <EmptyState
          icon="compass"
          title="여행을 찾을 수 없어요"
          hint="삭제됐거나 주소가 잘못된 것 같아요."
          action={<Button onClick={() => navigate('/trips')}>여행 목록으로</Button>}
        />
      </section>
    )
  }

  const phase = tripPhase(trip, today)

  return (
    <section className={styles.wrap} aria-label="여행 상세" data-testid="page-trip-detail">
      {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

      <header className={styles.header}>
        <Button variant="ghost" onClick={() => navigate('/trips')} aria-label="여행 목록으로">
          ← 여행
        </Button>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{trip.title}</h1>
          <p className={styles.period}>
            {trip.start_date} ~ {trip.end_date}
          </p>
        </div>
        {/* 상태는 텍스트로(§8) — 색 칩만으로 구분하지 않는다. */}
        <Chip tone={phase === 'ONGOING' ? 'ok' : phase === 'UPCOMING' ? 'pink' : 'neutral'}>
          {tripPhaseLabel(trip, today)}
        </Chip>
      </header>

      {/* Day 바는 이제 '전환'이 아니라 '점프'다 — 아래에 모든 Day가 이어져 있고 여기서 건너뛴다.
          긴 여행에서 스크롤만으로 찾기 어려운 것을 보완한다(트리플엔 없지만 우리 Day 수가 더 길 수 있다). */}
      {days.length > 1 ? (
        <nav className={styles.dayBar} aria-label="날짜로 이동">
          {days.map((d) => (
            <a key={d.key} className={styles.dayBtn} href={`#day-${d.key}`}>
              <span className={styles.dayNum}>Day {d.index}</span>
              <span className={styles.dayDate}>{d.key.slice(5)}</span>
              {d.key === today ? <span className={styles.todayDot}>오늘</span> : null}
            </a>
          ))}
        </nav>
      ) : null}

      {/* 모든 Day를 세로로 이어 붙인다(트리플) — 여행 전체가 하나의 흐름으로 읽힌다. */}
      {days.map((d) => (
        <div key={d.key} id={`day-${d.key}`}>
          <TripDaySection
            tripId={trip.id}
            dayKey={d.key}
            dayIndex={d.index}
            isToday={d.key === today}
            isPast={d.key < today}
            visitsByPlace={visitsByPlace}
            events={events ?? []}
            places={places ?? []}
            placeById={placeById}
            wishedIds={wishedIds}
            myId={myId}
            coupleId={coupleId}
            profiles={profiles ?? {}}
            busy={create.isPending || removing || saveReview.isPending}
            onSaveReview={(v) =>
              saveReview.mutate(
                { ...v, tripId: trip.id, visitDate: d.key },
                {
                  onSuccess: (r) => {
                    if (r === 'ok') toast.show('리뷰를 남겼어요.')
                  },
                  onError: (err) => toast.show(err.message),
                },
              )
            }
            onCreate={(e, done, fail) =>
              create.mutate(e, {
                onSuccess: () => {
                  toast.show(`‘${e.title}’ 담았어요.`)
                  done()
                },
                onError: (err) => {
                  const m = err instanceof Error ? err.message : '담지 못했어요.'
                  toast.show(m)
                  fail(m)
                },
              })
            }
            onRemove={(id, version) => deleteWithUndo({ id, expectedVersion: version })}
          />
        </div>
      ))}

      {/* 지난 여행이면 리캡으로 — 계획(앞)과 기록(뒤)을 한 화면에서 잇는다. */}
      {phase === 'PAST' ? (
        <Link className={styles.recapLink} to={`/trips/${trip.id}/recap`}>
          이 여행 리캡 보기 →
        </Link>
      ) : null}
    </section>
  )
}
