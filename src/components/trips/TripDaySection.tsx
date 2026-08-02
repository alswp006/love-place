import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { StopReview } from '@/components/trips/StopReview'
import { NaverMap } from '@/components/map/NaverMap'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useDirectionLegs } from '@/hooks/useDirectionLegs'
import { mergeLegPolylines } from '@/lib/recap/legs'
import { dayLegs, legIndexByFromId, legsKey, formatDistance } from '@/lib/trips/dayLegs'
import { openDirections } from '@/lib/places/directionsUrl'
import { formatTime, DISPLAY_TZ } from '@/lib/calendar/eventDays'
import { buildEventTimes } from '@/lib/calendar/eventTimes'
import { stopsOfDay, memosOfDay, slotIso, nextStopStartMin } from '@/lib/trips/tripDays'
import { deriveTrack, TRACK_META } from '@/lib/calendar/track'
import type { EventRow } from '@/hooks/useEvents'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { NewEvent } from '@/hooks/useEventMutations'
import type { VisitRow } from '@/hooks/useVisits'
import styles from '@/pages/TripDetailPage.module.css'

const STOP_LEN_MIN = 60

// 여행의 하루 — 트리플처럼 Day를 세로로 이어 붙인다(전환이 아니라 흐름).
// Day마다 길찾기 훅(useDirectionLegs)이 필요하므로 컴포넌트로 갈라야 한다(훅은 루프에서 못 부른다).
//
// 이 화면은 아무것도 따로 저장하지 않는다(CLAUDE.md §7):
//   스톱 = 그 날짜 events 중 place_id 있는 것 / 메모 = place_id 없는 것.
type Props = {
  tripId: string
  dayKey: string
  dayIndex: number
  isToday: boolean
  events: readonly EventRow[]
  places: readonly PlaceRow[]
  placeById: Map<string, PlaceRow>
  /** 담을 수 있는 후보(위시 중 이 날에 아직 없는 것) — 부모가 위시를 알고 있으므로 계산해 넘긴다. */
  wishedIds: ReadonlySet<string>
  myId: string | null
  coupleId: string | null
  profiles: ProfileMap
  busy: boolean
  /** 지난 날인가 — 리뷰는 다녀온 뒤에만 묻는다(가기 전에 물으면 빈칸만 늘어난다). */
  isPast: boolean
  /** 장소별 살아있는 방문행(둘 것 모두) — 리뷰는 여기 rating/memo다(§7 스키마 안 늘림). */
  visitsByPlace: ReadonlyMap<string, VisitRow[]>
  onCreate: (e: NewEvent, done: () => void, fail: (m: string) => void) => void
  onRemove: (id: string, version: number) => void
  onSaveReview: (v: { placeId: string; rating: number | null; memo: string | null }) => void
}

export function TripDaySection({
  tripId,
  dayKey,
  dayIndex,
  isToday,
  events,
  places,
  placeById,
  wishedIds,
  myId,
  coupleId,
  profiles,
  busy,
  isPast,
  visitsByPlace,
  onCreate,
  onRemove,
  onSaveReview,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoText, setMemoText] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const stops = useMemo(() => stopsOfDay(events, dayKey), [events, dayKey])
  const memos = useMemo(() => memosOfDay(events, dayKey), [events, dayKey])

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
  const dir = useDirectionLegs(
    coupleId,
    `${tripId}:${dayKey}`,
    legs.map((l) => ({ from: l.from, to: l.to })),
    legsKey(legs),
  )
  const legIndex = useMemo(() => legIndexByFromId(legs), [legs])
  const polyline = useMemo(() => {
    const plain = legs.map((l) => ({ from: l.from, to: l.to }))
    if (plain.length === 0) return []
    return dir.data ? mergeLegPolylines(plain, dir.data) : mergeLegPolylines(plain, [])
  }, [legs, dir.data])
  const orderById = useMemo(() => {
    const m: Record<string, number> = {}
    stops.forEach((s, i) => {
      if (s.place_id && m[s.place_id] === undefined) m[s.place_id] = i + 1
    })
    return m
  }, [stops])
  const dayPlaces = useMemo(
    () =>
      stops
        .map((s) => (s.place_id ? placeById.get(s.place_id) : undefined))
        .filter((p): p is PlaceRow => Boolean(p && p.lat != null && p.lng != null)),
    [stops, placeById],
  )

  const candidates = useMemo(() => {
    const already = new Set(stops.map((s) => s.place_id))
    return places.filter((p) => wishedIds.has(p.id) && !already.has(p.id))
  }, [places, wishedIds, stops])

  const addPlace = (placeId: string, name: string) => {
    const startMin = nextStopStartMin(stops, dayKey)
    setPendingId(placeId)
    onCreate(
      {
        title: name,
        start: slotIso(dayKey, startMin),
        end: slotIso(dayKey, startMin + STOP_LEN_MIN),
        isAllDay: false,
        timeZone: DISPLAY_TZ,
        visibility: 'SHARED',
        placeId,
      },
      () => setPendingId(null),
      () => setPendingId(null),
    )
  }

  const addMemo = (e: FormEvent) => {
    e.preventDefault()
    const t = memoText.trim()
    if (!t || busy) return
    const times = buildEventTimes({ date: dayKey, allDay: true, timeZone: DISPLAY_TZ })
    if (!times.ok) return
    onCreate(
      {
        title: t,
        start: times.start,
        end: times.end,
        isAllDay: true,
        timeZone: DISPLAY_TZ,
        // 메모는 '각자의 것' — 내 트랙에 놓인다. 상대에게 숨기는 게 아니라 색만 갈린다(§4.2).
        visibility: 'PERSONAL',
      },
      () => setMemoText(''),
      () => {},
    )
  }

  return (
    <section className={styles.daySection} aria-label={`Day ${dayIndex} ${dayKey}`}>
      <h2 className={styles.dayHead}>
        <span className={styles.dayHeadNum}>Day {dayIndex}</span>
        <span className={styles.dayHeadDate}>{dayKey.slice(5).replace('-', '.')}</span>
        {/* '오늘'은 색이 아니라 글자로도 말한다(§8). */}
        {isToday ? <span className={styles.dayHeadToday}>오늘</span> : null}
      </h2>

      {/* 그날 동선 — 스톱이 2곳 이상일 때만(1곳짜리 선은 의미 없음). */}
      {dayPlaces.length >= 2 && isNaverMapConfigured() ? (
        <div className={styles.mapWrap}>
          <NaverMap
            places={dayPlaces}
            snap="full"
            polyline={polyline}
            orderById={orderById}
            selectedId={focusedPlaceId}
            onSelect={setFocusedPlaceId}
            compact
          />
        </div>
      ) : null}

      {stops.length === 0 && memos.length === 0 ? (
        <p className={styles.dayEmpty}>아직 비어 있어요. 아래에서 장소나 메모를 더해보세요.</p>
      ) : (
        <ol className={styles.stops}>
          {stops.map((s, idx) => {
            const place = s.place_id ? placeById.get(s.place_id) : undefined
            const name = place?.name ?? s.title
            const track = deriveTrack(s, myId)
            const canRemove = s.visibility === 'SHARED' || s.owner_id === myId
            const li = legIndex[s.id]
            const leg = li === undefined ? undefined : legs[li]
            const dist = li === undefined ? null : formatDistance(dir.data?.[li]?.distanceMeters)
            const nextPlace = leg?.toId
              ? placeById.get(stops.find((x) => x.id === leg.toId)?.place_id ?? '')
              : undefined
            const meta = [place?.category, place?.region_label].filter(Boolean).join(' · ')
            return (
              <li key={s.id} className={styles.item}>
                <span className={styles.order} aria-hidden>
                  {idx + 1}
                </span>
                <div
                  className={
                    s.place_id && s.place_id === focusedPlaceId
                      ? `${styles.stop} ${styles.stopFocused}`
                      : styles.stop
                  }
                >
                  <span className={styles.time}>{formatTime(s.start)}</span>
                  <span className={styles.stopBody}>
                    <Link
                      className={styles.stopName}
                      to={`/calendar?date=${dayKey}`}
                      aria-label={`${idx + 1}. ${name} — 캘린더에서 시간 바꾸기`}
                      onMouseEnter={() => setFocusedPlaceId(s.place_id)}
                      onFocus={() => setFocusedPlaceId(s.place_id)}
                    >
                      {name}
                    </Link>
                    {meta ? <span className={styles.stopMeta}>{meta}</span> : null}
                    {/* 누가 담았는지 — 둘이 쓰는 앱의 축이다. 아바타 + 트랙 심볼·라벨(색 단독 금지 §8). */}
                    <span className={styles.stopOwner}>
                      <SourceAvatar
                        userId={s.owner_id}
                        profiles={profiles}
                        myId={myId}
                        context=" 담음"
                      />
                      <span
                        className={styles.stopTrack}
                        style={{ color: TRACK_META[track].cssVar }}
                      >
                        {TRACK_META[track].symbol} {TRACK_META[track].label}
                      </span>
                    </span>
                  </span>
                  {canRemove ? (
                    confirmId === s.id ? (
                      <button
                        type="button"
                        className={styles.stopConfirm}
                        onClick={() => {
                          onRemove(s.id, s.version)
                          setConfirmId(null)
                        }}
                        disabled={busy}
                      >
                        정말 뺄까요?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.stopDel}
                        onClick={() => setConfirmId(s.id)}
                        disabled={busy}
                        aria-label={`${name} 빼기`}
                      >
                        <Icon name="close" />
                      </button>
                    )
                  ) : null}

                  {/* 다녀온 날에만 리뷰를 묻는다. 각자 자기 별점·한 줄을 남긴다.
                      시각 열 옆이 아니라 카드 아래 전폭 — 좁은 칸에 두면 별 5개가 두 줄로 접힌다. */}
                  {isPast && s.place_id ? (
                    <StopReview
                      placeId={s.place_id}
                      placeName={name}
                      visits={visitsByPlace.get(s.place_id) ?? []}
                      myId={myId}
                      profiles={profiles}
                      busy={busy}
                      onSave={onSaveReview}
                    />
                  ) : null}
                </div>

                {leg && dist && nextPlace ? (
                  <button
                    type="button"
                    className={styles.legChip}
                    onClick={() =>
                      openDirections({ lat: leg.to.lat, lng: leg.to.lng, name: nextPlace.name })
                    }
                    aria-label={`${name}에서 ${nextPlace.name}까지 ${dist} — 길찾기 열기`}
                  >
                    <span className={styles.legText}>{dist} · 길찾기</span>
                  </button>
                ) : null}
              </li>
            )
          })}

          {/* 메모 — 장소가 없는 일정. 번호 대신 점으로 레일에 달아 스톱 순서를 흐리지 않는다. */}
          {memos.map((m) => {
            const track = deriveTrack(m, myId)
            const canRemove = m.visibility === 'SHARED' || m.owner_id === myId
            return (
              <li key={m.id} className={styles.item}>
                <span className={styles.memoDot} aria-hidden />
                <div className={styles.stop}>
                  <span className={styles.stopBody}>
                    <span className={styles.memoText}>{m.title}</span>
                    <span className={styles.stopOwner}>
                      <SourceAvatar
                        userId={m.owner_id}
                        profiles={profiles}
                        myId={myId}
                        context=" 메모"
                      />
                      <span
                        className={styles.stopTrack}
                        style={{ color: TRACK_META[track].cssVar }}
                      >
                        {TRACK_META[track].symbol} {TRACK_META[track].label}
                      </span>
                    </span>
                  </span>
                  {canRemove ? (
                    confirmId === m.id ? (
                      <button
                        type="button"
                        className={styles.stopConfirm}
                        onClick={() => {
                          onRemove(m.id, m.version)
                          setConfirmId(null)
                        }}
                        disabled={busy}
                      >
                        정말 지울까요?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.stopDel}
                        onClick={() => setConfirmId(m.id)}
                        disabled={busy}
                        aria-label={`${m.title} 메모 지우기`}
                      >
                        <Icon name="close" />
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* Day마다 추가 경로를 둔다(트리플) — 하나뿐이면 아래 Day에 담으려고 매번 위로 올라와야 한다. */}
      <div className={styles.dayActions}>
        <Button
          variant={adding ? 'ghost' : 'primary'}
          onClick={() => {
            setAdding((v) => !v)
            setMemoOpen(false)
          }}
          aria-expanded={adding}
          aria-controls={`add-${dayKey}`}
        >
          {adding ? '닫기' : '장소 추가'}
        </Button>
        <Button
          variant={memoOpen ? 'ghost' : 'primary'}
          onClick={() => {
            setMemoOpen((v) => !v)
            setAdding(false)
          }}
          aria-expanded={memoOpen}
          aria-controls={`memo-${dayKey}`}
        >
          {memoOpen ? '닫기' : '메모 추가'}
        </Button>
      </div>

      {adding ? (
        <div id={`add-${dayKey}`} className={styles.picker} aria-label={`Day ${dayIndex} 담을 장소 고르기`}>
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
                    onClick={() => addPlace(p.id, p.name)}
                    disabled={pendingId === p.id}
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

      {memoOpen ? (
        <form id={`memo-${dayKey}`} className={styles.memoForm} onSubmit={addMemo} aria-label={`Day ${dayIndex} 메모 추가`}>
          <input
            className={styles.memoInput}
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            placeholder="이 날 챙길 것"
            aria-label={`Day ${dayIndex} 메모 입력`}
            enterKeyHint="done"
          />
          <Button type="submit" variant="primary" disabled={busy || !memoText.trim()}>
            남기기
          </Button>
        </form>
      ) : null}
    </section>
  )
}
