import { supabase } from '@/lib/supabase/client'
import { parseKakaoAddress } from '@/lib/region/parseKakaoAddress'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

export type SaveResult = { placeId: string; jumped: boolean }

/** dedup 키(순수): 이름|주소|round(lat,4)|round(lng,4). 같은 건물 다른 가게 구분 + 좌표 미세변형 흡수. */
export function dedupKey(o: { name: string; address: string; lat: number; lng: number }): string {
  const r = (n: number) => (Math.round(n * 1e4) / 1e4).toFixed(4)
  return `${o.name}|${o.address}|${r(o.lat)}|${r(o.lng)}`
}

// 장소 저장(§5.2) — 중복(kakao_place_id=네이버 합성키)이면 기존 카드로 점프, 아니면 새로 insert + 내 wish upsert.
// 온라인 경로(useSavePlace)와 오프라인 큐 재생(offlineExecutor)이 공유하는 단일 출처.
export async function savePlace(coupleId: string, hit: KakaoPlaceHit, uid: string): Promise<SaveResult> {
  // 1) 이미 저장된 장소인가?(같은 커플 + 같은 kakao_place_id, soft-delete 제외)
  const { data: existing } = await supabase
    .from('places')
    .select('id')
    .eq('couple_id', coupleId)
    .eq('kakao_place_id', hit.kakaoPlaceId)
    .is('deleted_at', null)
    .maybeSingle()

  let placeId = ''
  let jumped = false
  let matched = false

  if (existing) {
    placeId = existing.id
    jumped = true
    matched = true
  }

  // 1.5) kakao_place_id가 빗나가면 좌표창 폴백 — 같은 물리적 장소를 다른 합성키로 잡는다.
  if (!matched) {
    const eps = 0.0001
    const { data: near } = await supabase
      .from('places')
      .select('id, name, address, lat, lng')
      .eq('couple_id', coupleId)
      .is('deleted_at', null)
      .gte('lat', hit.lat - eps)
      .lte('lat', hit.lat + eps)
      .gte('lng', hit.lng - eps)
      .lte('lng', hit.lng + eps)
    const key = dedupKey({ name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng })
    const match = (near ?? []).find(
      (p) =>
        p.lat != null &&
        p.lng != null &&
        dedupKey({ name: p.name as string, address: (p.address as string) ?? '', lat: p.lat as number, lng: p.lng as number }) === key,
    )
    if (match) {
      placeId = match.id as string
      jumped = true
      matched = true
    }
  }

  if (!matched) {
    const region = parseKakaoAddress(hit.address)
    const { data: inserted, error: insErr } = await supabase
      .from('places')
      .insert({
        couple_id: coupleId,
        name: hit.name,
        address: hit.address,
        region_code: region.regionCode,
        region_label: region.regionLabel,
        lat: hit.lat,
        lng: hit.lng,
        category: hit.category,
        kakao_place_id: hit.kakaoPlaceId,
        added_by: uid,
        created_by: uid,
        updated_by: uid,
      })
      .select('id')
      .single()
    if (insErr || !inserted) throw new Error(insErr?.message ?? '장소 저장에 실패했어요.')
    placeId = inserted.id
  }

  // 2) 내 wish 추가(이미 있으면 무시 — 유니크 제약). upsert로 중복 안전.
  const { error: wishErr } = await supabase.from('wishes').upsert(
    {
      couple_id: coupleId,
      place_id: placeId,
      user_id: uid,
      created_by: uid,
      updated_by: uid,
    },
    { onConflict: 'place_id,user_id', ignoreDuplicates: true },
  )
  if (wishErr) throw new Error(wishErr.message)

  return { placeId, jumped }
}
