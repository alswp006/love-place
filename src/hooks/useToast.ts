import { useState, useCallback, useRef } from 'react'

// 가벼운 토스트 상태 훅(액션 피드백). 컴포넌트는 components/common/Toast.tsx의 <Toast />.
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string, ms = 2200) => {
    setMsg(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), ms)
  }, [])
  return { msg, show }
}
