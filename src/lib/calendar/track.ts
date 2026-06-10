// 캘린더 3트랙 색 런타임 도출(설계서 §5.1·§4.2 / CLAUDE.md §7 "색은 저장 안 함, 도출").
// 색만으로 구분 금지(§8) → 라벨 + 심볼(패턴)로 이중화. 두 단말이 같은 규칙으로 도출(viewer 기준).

export type Track = 'shared' | 'mine' | 'partner'

export type TrackEvent = { visibility: 'SHARED' | 'PERSONAL'; owner_id: string }

/** SHARED=함께, PERSONAL=소유자 기준(내 것=mine, 상대 것=partner). myId 미상이면 PERSONAL은 partner로 안전 도출. */
export function deriveTrack(event: TrackEvent, myId: string | null): Track {
  if (event.visibility === 'SHARED') return 'shared'
  return myId != null && event.owner_id === myId ? 'mine' : 'partner'
}

export const TRACK_META: Record<Track, { label: string; cssVar: string; symbol: string }> = {
  shared: { label: '함께', cssVar: 'var(--c-track-shared)', symbol: '●' },
  mine: { label: '나', cssVar: 'var(--c-track-mine)', symbol: '▲' },
  partner: { label: '상대', cssVar: 'var(--c-track-partner)', symbol: '■' },
}

export const ALL_TRACKS: Track[] = ['shared', 'mine', 'partner']
