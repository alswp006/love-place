import { TRACK_META, type Track } from '@/lib/calendar/track'
import styles from './TrackLegend.module.css'

// Task 15(R4.4): 트랙 범례 — 명확성용 색+이름칩(비인터랙티브 legend).
// TrackChips(필터, 인터랙티브)와 구분: 여긴 버튼이 아니라 단순 표기(ul/li).
// 색 단독 금지(§8) → swatch(색) + 심볼(패턴) + 텍스트로 삼중 인코딩.
// shared/mine/partner 3트랙 모두 표기. partner 포함 이유: 타임라인에 ■/partner가
// 나타나므로(상대가 보는 viewer 트랙) 범례에도 명시해야 SR/색각 일관이 깨지지 않음.
// 라벨은 TRACK_META[track].label 단일출처로 사용(divergence 제거 → mine='나').

const LEGEND: { track: Track }[] = [{ track: 'shared' }, { track: 'mine' }, { track: 'partner' }]

export function TrackLegend() {
  return (
    <ul className={styles.legend} aria-label="일정 트랙 범례">
      {LEGEND.map(({ track }) => {
        const meta = TRACK_META[track]
        return (
          <li key={track} className={styles.item}>
            <span className={styles.swatch} style={{ background: meta.cssVar }} aria-hidden />
            <span aria-hidden>{meta.symbol}</span>
            <span className={styles.label}>{meta.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
