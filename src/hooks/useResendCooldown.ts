import { useCallback, useEffect, useRef, useState } from 'react'

// 매직링크 재전송 쿨다운 타이머(R3.6). start(seconds)로 카운트다운 시작,
// remaining===0 일 때만 재전송 허용(canResend). 언마운트 시 인터벌 정리.
export function useResendCooldown() {
  const [remaining, setRemaining] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  const start = useCallback((seconds: number) => {
    setRemaining(seconds)
    if (ref.current) clearInterval(ref.current)
    ref.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (ref.current) clearInterval(ref.current)
          return 0
        }
        return r - 1
      })
    }, 1000)
  }, [])
  useEffect(
    () => () => {
      if (ref.current) clearInterval(ref.current)
    },
    [],
  )
  return { remaining, canResend: remaining === 0, start }
}
