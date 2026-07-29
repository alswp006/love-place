import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { softDelete } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'

/**
 * '나도 찜' / '찜 해제' 토글 — useToggleReaction과 동형.
 *
 * 왜 필요했나: wishes에 쓰는 경로가 savePlace(검색→저장) 하나뿐이라, 이미 저장된 장소를
 * 탭하면 selectedId만 세팅되고 **내 wish는 생기지 않았다**. PriorityStepper도 내 wish가
 * 있을 때만 렌더돼서, 상대가 담아둔 장소에 내 의도를 남길 컨트롤이 아예 없었다.
 * 그래서 코드가 스스로 핵심 신호라고 적어둔 bothWished(✦ 마커·최상단 정렬)에 도달할
 * 정상 경로가 없었다. 역방향도 없어 "내 마음이 식었다"와 "우리 장소를 지운다"가
 * 같은 🗑 하나로 처리됐다.
 *
 * insert가 upsert가 아닌 이유: uq_wishes_place_user(0002)가 부분 유니크
 * (WHERE deleted_at IS NULL)라 onConflict 추론이 42P10을 낼 수 있고(savePlace와 같은 사유),
 * 부분 인덱스 덕분에 해제 후 재찜이 **새 행**으로 안전하게 들어간다.
 */
export function useToggleWish(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()

  return useMutation<void, Error, { placeId: string }>({
    mutationFn: async ({ placeId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      // 오프라인: 큐에 적재 → 재연결 시 그때 상태 기준으로 토글. dedupeKey로 같은 장소 1건.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('wish.toggle', { coupleId, placeId, myId }, `wish.toggle:${placeId}`)
        return
      }
      // stale-cache race 회피 — mutationFn에서 내 살아있는 wish를 직접 조회(id+version).
      const { data: mine, error: selErr } = await supabase
        .from('wishes')
        .select('id, version')
        .eq('couple_id', coupleId)
        .eq('place_id', placeId)
        .eq('user_id', myId)
        .is('deleted_at', null)
        .limit(1)
      if (selErr) throw new Error(selErr.message)
      const existing = mine?.[0]
      if (existing) {
        // 해제도 version 조건부 soft-delete — 0행이면 충돌로 표시(LWW 금지, §4.3).
        const res = await softDelete('wishes', existing.id as string, existing.version as number, myId)
        if (res.status === 'conflict') onConflict()
      } else {
        const { error } = await supabase.from('wishes').insert({
          couple_id: coupleId,
          place_id: placeId,
          user_id: myId,
          created_by: myId,
          updated_by: myId,
        })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishes', coupleId] })
      void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
    },
  })
}
