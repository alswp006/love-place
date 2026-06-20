import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useResendCooldown } from '@/hooks/useResendCooldown'

describe('useResendCooldown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('start(30)이면 remaining=30, canResend=false', () => {
    const { result } = renderHook(() => useResendCooldown())
    expect(result.current.remaining).toBe(0)
    expect(result.current.canResend).toBe(true)

    act(() => result.current.start(30))
    expect(result.current.remaining).toBe(30)
    expect(result.current.canResend).toBe(false)
  })

  it('1초마다 1씩 줄어 0이 되면 canResend=true', () => {
    const { result } = renderHook(() => useResendCooldown())
    act(() => result.current.start(3))
    expect(result.current.remaining).toBe(3)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(2)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(1)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(0)
    expect(result.current.canResend).toBe(true)
  })

  it('0이 된 뒤에도 더 흘러도 음수로 가지 않는다', () => {
    const { result } = renderHook(() => useResendCooldown())
    act(() => result.current.start(1))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.remaining).toBe(0)
  })

  it('진행 중 다시 start하면 remaining이 재설정된다', () => {
    const { result } = renderHook(() => useResendCooldown())
    act(() => result.current.start(10))
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.remaining).toBe(7)

    act(() => result.current.start(30))
    expect(result.current.remaining).toBe(30)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(29)
  })
})
