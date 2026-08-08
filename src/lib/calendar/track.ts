// 캘린더 3트랙 색 런타임 도출(설계서 §5.1·§4.2 / CLAUDE.md §7 "색은 저장 안 함, 도출").
// 색만으로 구분 금지(§8) → 라벨 + 아바타로 이중화(TrackBadge). 두 단말이 같은 규칙으로 도출(viewer 기준).

export type Track = 'shared' | 'mine' | 'partner'

export type TrackEvent = { visibility: 'SHARED' | 'PERSONAL'; owner_id: string }

/** SHARED=함께, PERSONAL=소유자 기준(내 것=mine, 상대 것=partner). myId 미상이면 PERSONAL은 partner로 안전 도출. */
export function deriveTrack(event: TrackEvent, myId: string | null): Track {
  if (event.visibility === 'SHARED') return 'shared'
  return myId != null && event.owner_id === myId ? 'mine' : 'partner'
}

// symbol(●▲■)을 걷어낸 이유: '색 단독 금지'(§8)를 가장 게으르게 푼 결과였는데, 옆에 label이
// 이미 있어 규칙은 그 글자만으로 충족돼 있었다. 도형은 중복이었고 화면을 사양서처럼 보이게 했다.
// 지금은 TrackBadge가 **아바타 + 이름**으로 표시한다 — 둘이 쓰는 앱에선 얼굴이 가장 빨리 읽힌다.
export const TRACK_META: Record<Track, { label: string; cssVar: string }> = {
  shared: { label: '함께', cssVar: 'var(--c-track-shared)' },
  mine: { label: '나', cssVar: 'var(--c-track-mine)' },
  partner: { label: '상대', cssVar: 'var(--c-track-partner)' },
}

export const ALL_TRACKS: Track[] = ['shared', 'mine', 'partner']
