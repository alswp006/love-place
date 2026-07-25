import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useTrips } from '@/hooks/useTrips'
import { useEvents } from '@/hooks/useEvents'
import { usePlaces } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useEventMutations } from '@/hooks/useEventMutations'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
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
    const m = new Map<string, string>()
    for (const p of places ?? []) m.set(p.id, p.name)
    return m
  }, [places])

  const stops = useMemo(
    () => (activeDay ? stopsOfDay(events ?? [], activeDay) : []),
    [events, activeDay],
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

      {/* 그 날의 스톱 — 시간순. 담긴 곳이 없으면 죽은 화면 대신 담기 유도(§7). */}
      {stops.length === 0 ? (
        <EmptyState
          emoji="📍"
          title="이 날은 아직 비어 있어요"
          hint="가고싶은 곳에서 골라 담으면 여기 순서대로 쌓여요."
        />
      ) : (
        <ol className={styles.stops}>
          {stops.map((s) => (
            <li key={s.id} className={styles.stop}>
              <span className={styles.time}>{formatTime(s.start)}</span>
              <span className={styles.stopBody}>
                <span className={styles.stopName}>
                  {s.place_id ? (placeById.get(s.place_id) ?? s.title) : s.title}
                </span>
                {s.memo ? <span className={styles.stopMemo}>{s.memo}</span> : null}
              </span>
              <button
                type="button"
                className={styles.stopDel}
                onClick={() => remove.mutate({ id: s.id, expectedVersion: s.version })}
                disabled={remove.isPending}
                aria-label={`${s.title} 빼기`}
              >
                ✕
              </button>
            </li>
          ))}
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
