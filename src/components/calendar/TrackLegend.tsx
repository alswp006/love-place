import { TRACK_META } from '@/lib/calendar/track'
import styles from './TrackLegend.module.css'

// Task 14(R2.3): 트랙 범례 — 명확성용 색+이름칩(비인터랙티브 legend).
// TrackChips(필터, 인터랙티브)와 구분: 여긴 버튼이 아니라 단순 표기(ul/li).
// 색 단독 금지(§8) → swatch(색) + 심볼(패턴) + 텍스트로 이중화.
// authoring 2트랙만 표기. mine 라벨은 TRACK_META의 '나' 대신 '내 일정'으로 의도적 표기.
// (viewer 전용 '상대'(partner)는 범례에서 제외 — 작성 가능한 트랙만 안내.)

const LEGEND: { track: 'shared' | 'mine'; label: string }[] = [
  { track: 'shared', label: '함께' },
  { track: 'mine', label: '내 일정' },
]

export function TrackLegend() {
  return (
    <ul className={styles.legend} aria-label="일정 트랙 범례">
      {LEGEND.map(({ track, label }) => {
        const meta = TRACK_META[track]
        return (
          <li key={track} className={styles.item}>
            <span className={styles.swatch} style={{ background: meta.cssVar }} aria-hidden />
            <span aria-hidden>{meta.symbol}</span>
            <span className={styles.label}>{label}</span>
          </li>
        )
      })}
    </ul>
  )
}
