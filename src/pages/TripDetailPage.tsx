import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useTrips } from '@/hooks/useTrips'
import { useEvents } from '@/hooks/useEvents'
import { usePlaces, type PlaceRow } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useEventMutations } from '@/hooks/useEventMutations'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { NaverMap } from '@/components/map/NaverMap'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useDirectionLegs } from '@/hooks/useDirectionLegs'
import { mergeLegPolylines } from '@/lib/recap/legs'
import { dayLegs, legIndexByFromId, legsKey, formatDistance } from '@/lib/trips/dayLegs'
import { openDirections } from '@/lib/places/directionsUrl'
import { formatTime, DISPLAY_TZ } from '@/lib/calendar/eventDays'
import { localDayKey } from '@/lib/journey/autoLink'
import {
  tripDays,
  tripPhase,
  tripPhaseLabel,
  stopsOfDay,
  slotIso,
  nextStopStartMin,
} from '@/lib/trips/tripDays'
import styles from './TripDetailPage.module.css'

// 🧳 여행 상세 — Day별 계획(트리플식 Day 슬롯).
// 계획을 여행에 따로 저장하지 않는다: Day N의 스톱 = 그 날짜에 든 events 중 place_id가 있는 것(CLAUDE.md §7).
// 그래서 캘린더 탭과 여기가 같은 데이터를 보고, 한쪽에서 고치면 다른 쪽에 그대로 반영된다(불일치 원천 차단).
const STOP_LEN_MIN = 60

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
  const conflict = useConflict()
  const { create, remove } = useEventMutations(coupleId, myId, conflict.flag)

  const trip = useMemo(() => (trips ?? []).find((t) => t.id === tripId) ?? null, [trips, tripId])
  const days = useMemo(() => (trip ? tripDays(trip) : []), [trip])
  const today = localDayKey()

  // 기본 선택 Day — 오늘이 기간에 들면 오늘, 아니면 첫날(여행 중엔 바로 오늘 것이 보이게).
  const [picked, setPicked] = useState<string | null>(null)
  const activeDay = picked ?? (days.some((d) => d.key === today) ? today : (days[0]?.key ?? null))

  const [adding, setAdding] = useState(false)

  const placeById = useMemo(() => {
    const m = new Map<string, PlaceRow>()
    for (const p of places ?? []) m.set(p.id, p)
    return m
  }, [places])

  const stops = useMemo(
    () => (activeDay ? stopsOfDay(events ?? [], activeDay) : []),
    [events, activeDay],
  )

  // 스톱 사이 구간 — 좌표가 양쪽 다 있는 인접 쌍만(좌표 미상이면 칩을 만들지 않는다).
  const legs = useMemo(
    () =>
      dayLegs(stops, (s) => {
        const p = s.place_id ? placeById.get(s.place_id) : undefined
        return p && typeof p.lat === 'number' && typeof p.lng === 'number'
          ? { lat: p.lat, lng: p.lng }
          : null
      }),
    [stops, placeById],
  )
  // 도로 스냅 — 프록시 미배포/실패면 조용히 없는 것으로(칩 숨김, 지도는 직선 폴백).
  const dir = useDirectionLegs(
    coupleId,
    activeDay ? `${tripId}:${activeDay}` : null,
    legs.map((l) => ({ from: l.from, to: l.to })),
    legsKey(legs),
  )
  const legIndex = useMemo(() => legIndexByFromId(legs), [legs])
  // 지도 선: 도로 경로가 오면 그것, 아니면 스톱을 직선으로 이은 베이스라인(2곳 이상일 때만).
  const polyline = useMemo(() => {
    const plain = legs.map((l) => ({ from: l.from, to: l.to }))
    if (plain.length === 0) return []
    return dir.data ? mergeLegPolylines(plain, dir.data) : mergeLegPolylines(plain, [])
  }, [legs, dir.data])
  // 미니 지도 마커 = 그날 스톱의 장소들(순서대로).
  const dayPlaces = useMemo(
    () =>
      stops
        .map((s) => (s.place_id ? placeById.get(s.place_id) : undefined))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.lat != null && p.lng != null)),
    [stops, placeById],
  )

  // 담을 후보 = 위시(가고싶음)로 찜한 장소 중 이 Day에 아직 없는 것.
  const candidates = useMemo(() => {
    const already = new Set(stops.map((s) => s.place_id))
    const wished = wishes?.byPlace ?? {}
    return (places ?? [])
      .filter((p) => wished[p.id] && !already.has(p.id))
      .sort((a, b) => (wished[b.id]?.maxPriority ?? 0) - (wished[a.id]?.maxPriority ?? 0))
  }, [places, wishes, stops])

  const onAdd = (placeId: string, name: string) => {
    if (!activeDay) return
    const startMin = nextStopStartMin(stops, activeDay)
    create.mutate(
      {
        title: name,
        start: slotIso(activeDay, startMin),
        end: slotIso(activeDay, startMin + STOP_LEN_MIN),
        isAllDay: false,
        timeZone: DISPLAY_TZ,
        visibility: 'SHARED',
        placeId,
      },
      { onSuccess: () => setAdding(false) },
    )
  }

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
          emoji="🧭"
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

      {/* Day 전환 — 토글 버튼 그룹(aria-pressed). 기간에서 도출하므로 별도 저장 없음. */}
      <div className={styles.dayBar} role="group" aria-label="여행 날짜 선택">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            className={d.key === activeDay ? styles.dayOn : styles.dayBtn}
            aria-pressed={d.key === activeDay}
            onClick={() => setPicked(d.key)}
          >
            <span className={styles.dayNum}>Day {d.index}</span>
            <span className={styles.dayDate}>{d.key.slice(5)}</span>
            {d.key === today ? <span className={styles.todayDot}>오늘</span> : null}
          </button>
        ))}
      </div>

      {/* 그날 동선 미니 지도 — 스톱이 2곳 이상일 때만(1곳짜리 선은 의미 없음).
          도로 경로가 오기 전엔 직선 베이스라인으로 즉시 그린다(프로그레시브). */}
      {dayPlaces.length >= 2 && isNaverMapConfigured() ? (
        <div className={styles.mapWrap}>
          <NaverMap places={dayPlaces} snap="full" polyline={polyline} />
        </div>
      ) : null}

      {/* 그 날의 스톱 — 시간순. 담긴 곳이 없으면 죽은 화면 대신 담기 유도(§7). */}
      {stops.length === 0 ? (
        <EmptyState
          emoji="📍"
          title="이 날은 아직 비어 있어요"
          hint="가고싶은 곳에서 골라 담으면 여기 순서대로 쌓여요."
        />
      ) : (
        <ol className={styles.stops}>
          {stops.map((s) => {
            const place = s.place_id ? placeById.get(s.place_id) : undefined
            const name = place?.name ?? s.title
            const li = legIndex[s.id]
            const leg = li === undefined ? undefined : legs[li]
            const dist = li === undefined ? null : formatDistance(dir.data?.[li]?.distanceMeters)
            // 다음 스톱(길찾기 목적지) — 구간이 있을 때만 존재.
            const nextPlace = leg?.toId
              ? placeById.get(stops.find((x) => x.id === leg.toId)?.place_id ?? '')
              : undefined
            return (
              <li key={s.id}>
                <div className={styles.stop}>
                  <span className={styles.time}>{formatTime(s.start)}</span>
                  <span className={styles.stopBody}>
                    <span className={styles.stopName}>{name}</span>
                    {s.memo ? <span className={styles.stopMemo}>{s.memo}</span> : null}
                  </span>
                  <button
                    type="button"
                    className={styles.stopDel}
                    onClick={() => remove.mutate({ id: s.id, expectedVersion: s.version })}
                    disabled={remove.isPending}
                    aria-label={`${name} 빼기`}
                  >
                    ✕
                  </button>
                </div>

                {/* 구간 칩 — 이미 보여줘야 하는 정보(거리)에 길찾기 탭 타깃을 얹는다(화면을 안 늘림).
                    거리 미상이면 칩 자체를 숨긴다(0km 같은 거짓말 금지). */}
                {leg && dist && nextPlace ? (
                  <button
                    type="button"
                    className={styles.legChip}
                    onClick={() =>
                      openDirections({
                        lat: leg.to.lat,
                        lng: leg.to.lng,
                        name: nextPlace.name,
                      })
                    }
                    aria-label={`${name}에서 ${nextPlace.name}까지 ${dist} — 길찾기 열기`}
                  >
                    <span className={styles.legLine} aria-hidden />
                    <span className={styles.legText}>↳ {dist} · 길찾기</span>
                  </button>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      <div className={styles.addBar}>
        <Button
          variant={adding ? 'ghost' : 'primary'}
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          aria-controls="trip-add-panel"
          disabled={!activeDay}
        >
          {adding ? '닫기' : '+ 가고싶은 곳에서 담기'}
        </Button>
      </div>

      {adding ? (
        <div id="trip-add-panel" className={styles.picker} aria-label="담을 장소 고르기">
          {candidates.length === 0 ? (
            <p className={styles.pickerEmpty}>
              담을 수 있는 가고싶은 곳이 없어요. 지도에서 먼저 찜해보세요.
            </p>
          ) : (
            <ul className={styles.pickerList}>
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.pick}
                    onClick={() => onAdd(p.id, p.name)}
                    disabled={create.isPending}
                  >
                    <span className={styles.pickName}>{p.name}</span>
                    {p.region_label ? (
                      <span className={styles.pickRegion}>{p.region_label}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* 지난 여행이면 리캡으로 — 계획(앞)과 기록(뒤)을 한 화면에서 잇는다. */}
      {phase === 'PAST' ? (
        <Link className={styles.recapLink} to={`/trips/${trip.id}/recap`}>
          이 여행 리캡 보기 →
        </Link>
      ) : null}
    </section>
  )
}
