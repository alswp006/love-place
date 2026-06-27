// 제3자 제공 통보 피드 — 순수 함수(테스트로 못박음). 위치정보법 제19조: 내 동선이 상대에게 제공(열람)된 사실 통보.
// PROVIDE 기록은 서버(get_session_points RPC)가 이미 남김 → 여기선 data_subject=나 인 PROVIDE 행을 통보 아이템으로 도출.
// notify_mode: IMMEDIATE=건별(최근 7일), BATCHED_30D=30일 1건 요약. (ux-and-accessibility §6 인앱 피드 1차 알림)
import type { NotifyMode } from './types'

export type ProvideLogRow = {
  id: string
  recipient_id: string | null
  event_at: string
  session_ref: string | null
}

export type ProvideFeedItem = {
  id: string
  kind: 'provide'
  label: string
  detail: string
  at: string
}

const DAY_MS = 86_400_000
const LABEL = '상대가 내 여행 동선을 열람했어요'

function relDayLabel(at: string, nowMs: number): string {
  const d = Math.floor((nowMs - new Date(at).getTime()) / DAY_MS)
  if (d <= 0) return '오늘'
  if (d === 1) return '어제'
  return `${d}일 전`
}

export function buildProvideFeed(
  rows: ProvideLogRow[],
  opts: { notifyMode: NotifyMode; nowIso: string; max?: number },
): ProvideFeedItem[] {
  const nowMs = new Date(opts.nowIso).getTime()
  const within = (days: number) =>
    rows.filter((r) => nowMs - new Date(r.event_at).getTime() <= days * DAY_MS)

  if (opts.notifyMode === 'BATCHED_30D') {
    const recent = within(30)
    if (recent.length === 0) return []
    const latest = recent.reduce((a, b) => (a.event_at > b.event_at ? a : b))
    return [
      {
        id: 'provide-batch',
        kind: 'provide',
        label: LABEL,
        detail: `최근 30일 ${recent.length}회`,
        at: latest.event_at,
      },
    ]
  }

  const recent = within(7).slice().sort((a, b) => (a.event_at < b.event_at ? 1 : -1))
  return recent.slice(0, opts.max ?? 5).map((r) => ({
    id: `provide:${r.id}`,
    kind: 'provide',
    label: LABEL,
    detail: relDayLabel(r.event_at, nowMs),
    at: r.event_at,
  }))
}
