import { useState, useCallback } from 'react'

// 동시편집 충돌(§4.3) 표시 상태 공유 — 여러 mutation 훅이 한 배너를 공유하도록 콜백(flag)으로 올린다.
export function useConflict() {
  const [conflict, setConflict] = useState(false)
  const flag = useCallback(() => setConflict(true), [])
  const clear = useCallback(() => setConflict(false), [])
  return { conflict, flag, clear }
}
