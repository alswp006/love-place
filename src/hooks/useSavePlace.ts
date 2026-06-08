import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'
import { parseKakaoAddress } from '@/lib/region/parseKakaoAddress'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

export type SaveResult = { placeId: string; jumped: boolean }

// 카카오 검색 결과를 우리 DB에 저장(§5.2).
// - places(공유): 없으면 새로 만들고, 같은 kakao_place_id가 있으면 기존 카드로 "점프"(중복 방지)
// - wishes(개인): 누른 사람의 찜을 추가(이미 있으면 유지)
// 둘 다 같은 couple_id로 저장 → RLS가 둘만 보이게 보장.
export function useSavePlace(coupleId: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation<SaveResult, Error, KakaoPlaceHit>({
    mutationFn: async (hit) => {
      if (!coupleId || !user) throw new Error('먼저 상대와 연결해 주세요.')
      const uid = user.id

      // 1) 이미 저장된 장소인가?(같은 커플 + 같은 kakao_place_id, soft-delete 제외)
      const { data: existing } = await supabase
        .from('places')
        .select('id')
        .eq('couple_id', coupleId)
        .eq('kakao_place_id', hit.kakaoPlaceId)
        .is('deleted_at', null)
        .maybeSingle()

      let placeId: string
      let jumped = false

      if (existing) {
        placeId = existing.id
        jumped = true
      } else {
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
    },
    onSuccess: () => {
      // 위시 목록·지도 갱신
      queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
      queryClient.invalidateQueries({ queryKey: ['wishes', coupleId] })
    },
  })
}
