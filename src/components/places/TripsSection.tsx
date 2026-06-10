import { useState, type FormEvent } from 'react'
import { useTrips, useCreateTrip, useDeleteTrip } from '@/hooks/useTrips'
import type { VisitRow } from '@/hooks/useVisits'
import { visitCountByTrip, groupTripsByRegion } from '@/lib/places/tripGroups'
import styles from './TripsSection.module.css'

// ✈️ 여행(Trips, §5.3) — 가본 곳을 여행 단위로. 접을 수 있는 섹션(열 때만 조회).
// visits는 상위(PlacesPage)에서 받아 동일 토픽 realtime 중복 구독을 피한다.
export function TripsSection({
  coupleId,
  myId,
  visits,
}: {
  coupleId: string | null
  myId: string | null
  visits: VisitRow[]
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'trip' | 'region'>('trip')
  const [form, setForm] = useState({ title: '', start: '', end: '' })
  const { data: trips } = useTrips(open ? coupleId : null) // 열 때만 조회·구독
  const create = useCreateTrip(coupleId, myId)
  const del = useDeleteTrip(coupleId, myId)

  const list = trips ?? []
  const counts = visitCountByTrip(visits)
  const groups = groupTripsByRegion(list)

  const onCreate = (e: FormEvent) => {
    e.preventDefault()
    const title = form.title.trim()
    if (!title || !form.start || !form.end || form.end < form.start) return
    create.mutate(
      { title, startDate: form.start, endDate: form.end },
      { onSuccess: () => setForm({ title: '', start: '', end: '' }) },
    )
  }

  const renderTrip = (t: (typeof list)[number]) => (
    <li key={t.id} className={styles.trip}>
      <div className={styles.tripMain}>
        <span className={styles.tripTitle}>{t.title}</span>
        <span className={styles.tripMeta}>
          {t.start_date}~{t.end_date}
          {counts[t.id] ? ` · ${counts[t.id]}곳 방문` : ''}
        </span>
      </div>
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

  return (
    <section className={styles.section} aria-label="여행">
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>✈️ 여행{open && list.length > 0 ? ` (${list.length})` : ''}</span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className={styles.body}>
          <form className={styles.createForm} onSubmit={onCreate} aria-label="여행 만들기">
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
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                aria-label="시작일"
              />
              <span aria-hidden>~</span>
              <input
                type="date"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                aria-label="종료일"
              />
            </div>
            <button
              type="submit"
              className={styles.add}
              disabled={create.isPending || !form.title.trim() || !form.start || !form.end}
            >
              여행 추가
            </button>
          </form>

          {list.length === 0 ? (
            <p className={styles.empty}>아직 여행이 없어요. 가본 곳을 여행으로 묶어보세요.</p>
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
                <ul className={styles.list}>{list.map(renderTrip)}</ul>
              ) : (
                groups.map((g) => (
                  <div key={g.regionKey} className={styles.regionGroup}>
                    <h3 className={styles.regionTitle}>{g.regionKey === '미지정' ? '지역 미지정' : g.regionKey}</h3>
                    <ul className={styles.list}>{g.trips.map(renderTrip)}</ul>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
