import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { OfflineQueue } from './offlineQueue'
import { createDefaultOutboxStore } from './outboxStore'
import { executeOutbox } from './offlineExecutor'

// 오프라인 쓰기 큐의 React 통합(D2) — 큐 소유 + online/offline 감지 + 재연결 자동 flush + 대기/충돌 카운트.
// 쓰기 훅은 navigator.onLine이 false면 enqueue로 적재 → 재연결 시 자동 동기화(유실 0).
type Ctx = {
  online: boolean
  pending: number
  flushConflicts: number
  enqueue: (kind: string, payload: unknown, dedupeKey?: string) => Promise<void>
  clearConflicts: () => void
}

const OfflineQueueContext = createContext<Ctx | null>(null)

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const queueRef = useRef<OfflineQueue | null>(null)
  if (!queueRef.current) queueRef.current = new OfflineQueue(createDefaultOutboxStore())
  const queue = queueRef.current

  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [pending, setPending] = useState(0)
  const [flushConflicts, setFlushConflicts] = useState(0)

  const refreshPending = useCallback(async () => {
    setPending(await queue.pending())
  }, [queue])

  const flush = useCallback(async () => {
    const res = await queue.flush(executeOutbox)
    if (res.done > 0 || res.conflicts.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['places'] })
      void queryClient.invalidateQueries({ queryKey: ['wishes'] })
      void queryClient.invalidateQueries({ queryKey: ['placesTrash'] })
    }
    if (res.conflicts.length > 0) setFlushConflicts((c) => c + res.conflicts.length)
    await refreshPending()
  }, [queue, queryClient, refreshPending])

  const enqueue = useCallback(
    async (kind: string, payload: unknown, dedupeKey?: string) => {
      await queue.enqueue(kind, payload, dedupeKey)
      await refreshPending()
      // 온라인이면 즉시 비운다(온라인 경로의 일시적 실패 후 enqueue된 경우 등).
      if (typeof navigator === 'undefined' || navigator.onLine) void flush()
    },
    [queue, refreshPending, flush],
  )

  const clearConflicts = useCallback(() => setFlushConflicts(0), [])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void flush()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // 마운트 시 대기분 반영 + 온라인이면 비움(이전 세션에서 남은 큐 재시도).
    void flush()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [flush])

  return (
    <OfflineQueueContext.Provider value={{ online, pending, flushConflicts, enqueue, clearConflicts }}>
      {children}
    </OfflineQueueContext.Provider>
  )
}

export function useOfflineQueue(): Ctx {
  const ctx = useContext(OfflineQueueContext)
  if (!ctx) throw new Error('useOfflineQueue는 <OfflineQueueProvider> 안에서만 사용하세요.')
  return ctx
}
