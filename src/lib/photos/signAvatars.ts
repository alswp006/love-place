import { supabase } from '@/lib/supabase/client'

// profiles.avatar_url에는 **Storage 경로**가 들어간다(photos 버킷은 비공개다 — 0022).
// 그대로 <img src>에 넣으면 `c1/avatars/u1-…webp` 같은 상대 경로가 되어 깨진다.
// 프로필을 읽는 쪽이 두 군데(useProfiles·useCouple)라, 한쪽만 고치면 다른 쪽이 조용히 깨진다.
// 그래서 서명은 여기 한 곳에서만 한다.

const BUCKET = 'photos'
const TTL_SEC = 60 * 60

/**
 * 경로 목록 → { 경로: 서명 URL }.
 *
 * 실패해도 던지지 않는다: 아바타는 장식이고, 이름·색은 앱 곳곳이 의존하는 값이다.
 * 사진 하나 못 불러왔다고 프로필 쿼리 전체가 죽으면 캘린더 트랙 라벨까지 사라진다.
 * 못 얻은 경로는 그냥 빠지고, 호출부는 이니셜+색으로 폴백한다.
 */
export async function signAvatarPaths(
  paths: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))))
  if (unique.length === 0) return {}
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, TTL_SEC)
    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) map[row.path] = row.signedUrl
    }
    return map
  } catch {
    return {}
  }
}
