import { useMemo, useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Link } from 'react-router-dom'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { CtaLink } from '@/components/common/CtaLink'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useTrips, useCreateTrip, useDeleteTrip } from '@/hooks/useTrips'
import { useEvents } from '@/hooks/useEvents'
import { useVisits } from '@/hooks/useVisits'
import { usePlaces } from '@/hooks/usePlaces'
import { visitCountByTrip, deriveTripRegion, groupTripsByKey } from '@/lib/places/tripGroups'
import { sortTripsForList, tripPhase, tripPhaseLabel, stopCountInTrip, stopsInTrip } from '@/lib/trips/tripDays'
import { localDayKey } from '@/lib/journey/autoLink'
import { tabByPath } from '@/app/tabs'
import styles from './TripsPage.module.css'

// 🧳 여행 — 여행 목록(§5.3). '우리'(설정) 탭에 접혀 있던 섹션을 탭으로 승격.
// 정렬은 진행중 → 예정 → 지난(tripDays.sortTripsForList) — 지금 무슨 일이 벌어지는지가 맨 위.
// 계획(담긴 곳) 수는 events에서 도출한다 — 여행에 계획을 따로 저장하지 않는다(CLAUDE.md §7).
export default function TripsPage() {
  const tab = tabByPath('/trips')
  const { user } = useAuth()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const myId = user?.id ?? null

  const { data: trips, isLoading } = useTrips(coupleId)
  const { data: events } = useEvents(coupleId)
  const { data: visits } = useVisits(coupleId)
  const { data: places } = usePlaces(coupleId)
  const create = useCreateTrip(coupleId, myId)
  const del = useDeleteTrip(coupleId, myId)

  const [formOpen, setFormOpen] = useState(false)
  const [view, setView] = useState<'trip' | 'region'>('trip') // 이관 전 TripsSection의 보기 전환 유지
  const [form, setForm] = useState({ title: '', start: '', end: '' })

  const today = localDayKey()
  const list = useMemo(() => sortTripsForList(trips ?? [], today), [trips, today])
  const visitCounts = useMemo(() => visitCountByTrip(visits ?? []), [visits])

  // 여행 → 지역. 담긴 장소의 지역에서 도출한다(§7) — 따로 고르게 하면 전부 '미지정'에 쌓인다.
  const regionOf = useMemo(() => {
    const labelById = new Map((places ?? []).map((p) => [p.id, p.region_label]))
    const m = new Map<string, string | null>()
    for (const t of trips ?? []) {
      const labels = stopsInTrip(events ?? [], t).map((e) =>
        e.place_id ? (labelById.get(e.place_id) ?? null) : null,
      )
      m.set(t.id, deriveTripRegion(t, labels))
    }
    return m
  }, [trips, events, places])

  const canSubmit =
    Boolean(form.title.trim()) && Boolean(form.start) && Boolean(form.end) && form.end >= form.start

  // 여행별/지역별 두 보기가 같은 카드를 쓴다(중복 렌더 로직 방지).
  const renderTrip = (t: (typeof list)[number]) => {
    const phase = tripPhase(t, today)
    const planned = stopCountInTrip(events ?? [], t)
    const visited = visitCounts[t.id] ?? 0
    return (
      <li key={t.id} className={styles.item}>
        <Link className={styles.card} to={`/trips/${t.id}`} aria-label={`${t.title} 여행 상세 열기`}>
          <div className={styles.cardHead}>
            <span className={styles.title}>{t.title}</span>
            {/* 상태는 색이 아니라 텍스트로 말한다(§8 색만 의존 금지). */}
            <Chip tone={phase === 'ONGOING' ? 'ok' : phase === 'UPCOMING' ? 'pink' : 'neutral'}>
              {tripPhaseLabel(t, today)}
            </Chip>
          </div>
          <span className={styles.meta}>
            {t.start_date} ~ {t.end_date}
          </span>
          <span className={styles.counts}>
            {planned > 0 ? `담은 곳 ${planned}` : '담은 곳 없음'}
            {visited > 0 ? ` · 다녀온 곳 ${visited}` : ''}
          </span>
        </Link>
        <button
          type="button"
          className={styles.del}
          onClick={() => del.mutate({ id: t.id, expectedVersion: t.version })}
          disabled={del.isPending}
          aria-label={`${t.title} 삭제`}
        >
          🗑
        </button>
      </li>
    )
  }

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    create.mutate(
      { title: form.title.trim(), startDate: form.start, endDate: form.end },
      {
        onSuccess: () => {
          setForm({ title: '', start: '', end: '' })
          setFormOpen(false)
        },
      },
    )
  }

  return (
    <ScreenScaffold title={tab.title} testId={tab.testId} headerHidden>
      {/* 만들기는 이 화면의 주 행동이라 우상단 작은 버튼이 아니라 카드로 올린다(트리플 구조).
          여행이 없을 땐 특히 여기가 유일한 출발점이다. */}
      <button
        type="button"
        className={styles.createCard}
        onClick={() => setFormOpen((v) => !v)}
        aria-expanded={formOpen}
        aria-controls="trip-create-form"
      >
        <span className={styles.createIcon} aria-hidden>
          <Icon name={formOpen ? 'close' : 'plus'} />
        </span>
        <span className={styles.createText}>
          <span className={styles.createTitle}>{formOpen ? '취소' : '여행 일정 만들기'}</span>
          <span className={styles.createHint}>
            {formOpen ? '만들지 않고 닫아요' : '날짜를 정하면 그날그날 갈 곳을 담아둘 수 있어요.'}
          </span>
        </span>
      </button>

      {formOpen ? (
        <form id="trip-create-form" className={styles.form} onSubmit={onCreate} aria-label="여행 만들기">
          <input
            className={styles.input}
            placeholder="여행 이름 (예: 속초 1박2일)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            aria-label="여행 이름"
          />
          <div className={styles.dates}>
            <input
              type="date"
              className={styles.date}
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              aria-label="시작일"
            />
            <span aria-hidden>~</span>
            <input
              type="date"
              className={styles.date}
              value={form.end}
              min={form.start || undefined}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              aria-label="종료일"
            />
          </div>
          {form.start && form.end && form.end < form.start ? (
            <p className={styles.formError} role="alert">
              종료일이 시작일보다 빠를 수 없어요.
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={create.isPending || !canSubmit}>
            {create.isPending ? '만드는 중…' : '여행 만들기'}
          </Button>
        </form>
      ) : null}

      {isLoading ? (
        <Skeleton count={3} label="여행 불러오는 중" />
      ) : list.length === 0 ? (
        <EmptyState
          emoji={tab.empty.emoji}
          title={tab.empty.title}
          hint={tab.empty.hint}
          action={
            tab.empty.action ? (
              <CtaLink to={tab.empty.action.to}>{tab.empty.action.label}</CtaLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className={styles.viewToggle} role="group" aria-label="보기 전환">
            <button
              type="button"
              className={view === 'trip' ? styles.viewOn : styles.viewBtn}
              aria-pressed={view === 'trip'}
              onClick={() => setView('trip')}
            >
              여행별
            </button>
            <button
              type="button"
              className={view === 'region' ? styles.viewOn : styles.viewBtn}
              aria-pressed={view === 'region'}
              onClick={() => setView('region')}
            >
              지역별
            </button>
          </div>

          {view === 'trip' ? (
            // 다가오는 것과 끝난 것은 성격이 다르다 — 섞어 두면 '지금 뭘 준비해야 하는지'가 안 보인다.
            // sortTripsForList가 이미 예정→지난 순으로 주므로 경계에서만 나눈다(정렬 규칙 재구현 금지).
            (() => {
              const upcoming = list.filter((t) => tripPhase(t, today) !== 'PAST')
              const past = list.filter((t) => tripPhase(t, today) === 'PAST')
              return (
                <>
                  {upcoming.length > 0 ? (
                    <ul className={styles.list}>{upcoming.map(renderTrip)}</ul>
                  ) : null}
                  {past.length > 0 ? (
                    <>
                      <h2 className={styles.sectionTitle}>지난 여행</h2>
                      <ul className={styles.list}>{past.map(renderTrip)}</ul>
                    </>
                  ) : null}
                </>
              )
            })()
          ) : (
            groupTripsByKey(list, (t) => regionOf.get(t.id) ?? null).map((g) => (
              <div key={g.regionKey} className={styles.regionGroup}>
                <h2 className={styles.regionTitle}>
                  {g.regionKey === '미지정' ? '지역 미지정' : g.regionKey}
                  {/* 개수를 같이 — '강릉 3'처럼 지역이 얼마나 쌓였는지 한눈에. */}
                  <span className={styles.regionCount}>{g.trips.length}</span>
                </h2>
                <ul className={styles.list}>{g.trips.map(renderTrip)}</ul>
              </div>
            ))
          )}
        </>
      )}
    </ScreenScaffold>
  )
}
