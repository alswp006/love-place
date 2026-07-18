import { describe, it, expect, vi, beforeEach } from 'vitest'

// useJourneyRecording — write-side 오케스트레이터. 핵심 검증: 종료 시 stop→drain→end 순서(막판 점 유실 방지).
const order: string[] = []
const h = vi.hoisted(() => ({
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  end: vi.fn(),
  recEnsureReady: vi.fn(),
  recStart: vi.fn(),
  onPoint: null as ((p: { client_point_id: string; recorded_at: string; lat: number; lng: number; accuracy_m: number | null; speed_mps: number | null }) => void) | null,
  recStop: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ supabase: { rpc: vi.fn() }, isSupabaseConfigured: true }))
vi.mock('@/hooks/useTripSession', () => ({
  useTripSession: () => ({
    start: h.start,
    pause: h.pause,
    resume: h.resume,
    end: h.end,
    isStarting: false,
  }),
}))
vi.mock('@/lib/journey/recorder', () => ({
  getJourneyRecorder: async () => ({
    ensureReady: h.recEnsureReady,
    start: h.recStart,
    stop: h.recStop,
    isActive: () => true,
  }),
}))
vi.mock('@/lib/journey/pointQueue', () => ({
  createDefaultPointStore: () => ({}),
  enqueuePoint: h.enqueue,
  flush: h.flush,
}))

import { renderHook, act } from '@testing-library/react'
import { useJourneyRecording } from '@/hooks/useJourneyRecording'

beforeEach(() => {
  order.length = 0
  h.start.mockReset().mockImplementation(async () => {
    order.push('session.start')
    return 's1'
  })
  h.pause.mockReset().mockImplementation(async () => void order.push('session.pause'))
  h.resume.mockReset().mockImplementation(async () => void order.push('session.resume'))
  h.end.mockReset().mockImplementation(async () => void order.push('session.end'))
  h.recEnsureReady.mockReset().mockImplementation(async () => void order.push('rec.ensureReady'))
  h.onPoint = null
  h.recStart.mockReset().mockImplementation(async (cb) => {
    order.push('rec.start')
    h.onPoint = cb as typeof h.onPoint
  })
  h.recStop.mockReset().mockImplementation(async () => void order.push('rec.stop'))
  h.enqueue.mockReset().mockResolvedValue(true)
  h.flush.mockReset().mockImplementation(async () => {
    order.push('flush')
    return 1
  })
})

describe('useJourneyRecording — 녹화 오케스트레이션', () => {
  it('start: 선체크(ensureReady) → 세션 생성 → recorder.start → recording 상태', async () => {
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await result.current.start()
    })
    // 선체크가 세션 생성보다 먼저 — 위치 꺼짐이면 세션조차 만들지 않는다.
    expect(order).toEqual(['rec.ensureReady', 'session.start', 'rec.start'])
    expect(result.current.isRecording).toBe(true)
    expect(result.current.sessionId).toBe('s1')
  })

  it('위치 서비스 꺼짐(ensureReady throw): 세션 미생성 + 상태 idle 유지(기록중 아님)', async () => {
    h.recEnsureReady.mockRejectedValueOnce(new Error('위치 서비스가 꺼져 있어요.'))
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await expect(result.current.start()).rejects.toThrow(/위치 서비스/)
    })
    expect(h.start).not.toHaveBeenCalled() // 세션 생성 안 됨
    expect(h.recStart).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.sessionId).toBeNull()
  })

  it('recorder.start 실패 시 방금 만든 세션을 롤백(session.end) + idle 복귀', async () => {
    h.recStart.mockRejectedValueOnce(new Error('recorder failed'))
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await expect(result.current.start()).rejects.toThrow(/recorder failed/)
    })
    expect(h.start).toHaveBeenCalled() // 세션은 만들어졌고
    expect(h.end).toHaveBeenCalled() // 롤백으로 end 호출
    expect(result.current.status).toBe('idle')
    expect(result.current.sessionId).toBeNull()
  })

  it('★ end: recorder.stop → 큐 drain → session.end 순서(막판 점 유실 방지)', async () => {
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await result.current.start()
    })
    order.length = 0
    await act(async () => {
      await result.current.end()
    })
    expect(order).toEqual(['rec.stop', 'flush', 'session.end'])
    // drain(flush)이 session.end보다 먼저 — 종료 시점에 세션은 아직 활성이라 막판 점이 record_points를 통과.
    expect(order.indexOf('flush')).toBeLessThan(order.indexOf('session.end'))
    expect(result.current.status).toBe('idle')
  })

  it('pause도 stop→drain→pause 순서(일시중지 직전 점 보존)', async () => {
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await result.current.start()
    })
    order.length = 0
    await act(async () => {
      await result.current.pause()
    })
    expect(order).toEqual(['rec.stop', 'flush', 'session.pause'])
    expect(result.current.isPaused).toBe(true)
  })

  it('start 안 한 상태에서 end는 no-op(세션 없음)', async () => {
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await result.current.end()
    })
    expect(order).toEqual([])
    expect(h.end).not.toHaveBeenCalled()
  })

  it('점 수집 거리를 종료 시 recorded_distance_m로 전달(+end는 {id,version} 반환)', async () => {
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: true }))
    await act(async () => {
      await result.current.start()
    })
    // 위도 0.01도 ≈ 1.11km 이동한 두 점 수집
    const pt = (lat: number, i: number) => ({
      client_point_id: `p${i}`, recorded_at: `2026-07-18T10:0${i}:00Z`,
      lat, lng: 127, accuracy_m: 5, speed_mps: null,
    })
    h.onPoint?.(pt(37.5, 1))
    h.onPoint?.(pt(37.51, 2))
    let ended: { id: string; version: number } | null = null
    await act(async () => {
      ended = await result.current.end()
    })
    expect(ended).toEqual({ id: 's1', version: 2 })
    const arg = h.end.mock.calls[0]![0] as { recordedDistanceM: number }
    expect(arg.recordedDistanceM).toBeGreaterThan(1000)
    expect(arg.recordedDistanceM).toBeLessThan(1250)
  })

  it('동의 없으면 start가 throw(세션 미생성)되고 상태 idle 유지', async () => {
    h.start.mockRejectedValueOnce(new Error('위치 수집·이용 동의가 필요해요.'))
    const { result } = renderHook(() => useJourneyRecording('c1', 'u1', 't1', { canRecord: false }))
    await act(async () => {
      await expect(result.current.start()).rejects.toThrow(/동의/)
    })
    expect(result.current.status).toBe('idle')
    expect(h.recStart).not.toHaveBeenCalled()
  })
})
