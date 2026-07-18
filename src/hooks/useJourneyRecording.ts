import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTripSession } from './useTripSession'
import { getJourneyRecorder, type JourneyRecorder } from '@/lib/journey/recorder'
import {
  createDefaultPointStore,
  enqueuePoint,
  flush,
  type PointSender,
} from '@/lib/journey/pointQueue'

// R6 녹화 오케스트레이터 — 세션 + recorder + 오프라인 큐를 잇는 write-side 컨트롤러.
// ★ 종료/일시중지 순서 불변식: recorder.stop → 큐 drain(아직 활성 상태라 record_points 게이트 통과) → 상태 변경.
//   이 순서가 깨지면 "여행 막판 점이 닫힌 세션 게이트에 막혀 유실"되는 재현난 버그가 생긴다(설계 §2.1, 서버 게이트 0017).
const FLUSH_MS = 20_000

export type JourneyStatus = 'idle' | 'recording' | 'paused'

export function useJourneyRecording(
  coupleId: string | null,
  userId: string | null,
  tripId: string | null | undefined,
  opts: { canRecord: boolean },
) {
  const session = useTripSession(coupleId, userId, tripId, opts)
  const [status, setStatus] = useState<JourneyStatus>('idle')
  const storeRef = useRef(createDefaultPointStore())
  const recorderRef = useRef<JourneyRecorder | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const versionRef = useRef(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 큐 → record_points 전송자(서버가 client_point_id 멱등 처리 → 중복 0).
  const sender = useCallback<PointSender>(async (sid, points) => {
    const { data, error } = await supabase.rpc('record_points', { p_session: sid, p_points: points })
    if (error) throw new Error(error.message)
    return typeof data === 'number' ? data : points.length
  }, [])

  const drain = useCallback(async () => {
    const sid = sessionIdRef.current
    if (sid) await flush(storeRef.current, sid, sender)
  }, [sender])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setInterval(() => {
      void drain()
    }, FLUSH_MS)
  }, [clearTimer, drain])

  const onPointFor = (id: string) => (p: Parameters<typeof enqueuePoint>[2]) => {
    void enqueuePoint(storeRef.current, id, p)
  }

  const start = useCallback(async () => {
    // 1) 위치 서비스/권한 선체크를 '세션 생성 전에' — 꺼져 있으면 여기서 throw(한국어).
    //    DB 세션을 만들기 전이라 고아 RECORDING 세션이 남지 않고 상태도 idle 유지.
    const rec = recorderRef.current ?? (recorderRef.current = await getJourneyRecorder())
    await rec.ensureReady()
    // 2) 동의 게이트 통과 시 RECORDING 세션 생성.
    const id = await session.start()
    sessionIdRef.current = id
    versionRef.current = 1
    // 3) 수집 시작. 실패하면 방금 만든 세션을 롤백(고아 세션 방지) 후 rethrow.
    try {
      await rec.start(onPointFor(id))
    } catch (e) {
      try {
        await session.end({ id, version: versionRef.current })
      } catch {
        /* 롤백 실패는 삼킴 — 고아 세션 정리 잡(purge_orphan_sessions)이 후속 처리 */
      }
      sessionIdRef.current = null
      throw e
    }
    startTimer()
    setStatus('recording')
  }, [session, startTimer])

  const pause = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    clearTimer()
    await recorderRef.current?.stop() // 새 점 차단
    await drain() // 큐 비우기 — 아직 RECORDING이라 게이트 통과
    await session.pause({ id, version: versionRef.current })
    versionRef.current += 1
    setStatus('paused')
  }, [session, drain, clearTimer])

  const resume = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    await session.resume({ id, version: versionRef.current })
    versionRef.current += 1
    await recorderRef.current?.start(onPointFor(id))
    startTimer()
    setStatus('recording')
  }, [session, startTimer])

  const end = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    clearTimer()
    await recorderRef.current?.stop() // 1) 수집 중단(새 점 차단)
    await drain() // 2) 큐 비우기 — 세션이 아직 활성(RECORDING/PAUSED)이라 게이트 통과 ★
    await session.end({ id, version: versionRef.current }) // 3) 그 다음 DONE
    versionRef.current += 1
    sessionIdRef.current = null
    setStatus('idle')
  }, [session, drain, clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  return {
    status,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    sessionId: sessionIdRef.current,
    start,
    pause,
    resume,
    end,
  }
}
