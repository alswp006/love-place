import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ToastProvider.module.css'

export type ToastAction = { label: string; onClick: () => void }
export type ToastItem = { id: number; message: string; action?: ToastAction }
type ShowArg = string | { message: string; action?: ToastAction; ms?: number }

type ToastApi = { show: (arg: ShowArg, ms?: number) => void }
const ToastContext = createContext<ToastApi | null>(null)

// 앱 레벨 토스트 — 컨텍스트로 어디서든 show, 포털로 셸 위 단일 뷰포트에 큐로 쌓는다(액션·자동 해제).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])
  const show = useCallback(
    (arg: ShowArg, ms?: number) => {
      const id = ++idRef.current
      const item: ToastItem =
        typeof arg === 'string' ? { id, message: arg } : { id, message: arg.message, action: arg.action }
      const ttl = typeof arg === 'object' && arg.ms != null ? arg.ms : (ms ?? (item.action ? 6000 : 2200))
      setItems((prev) => [...prev, item])
      setTimeout(() => dismiss(id), ttl)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.viewport} role="status" aria-live="polite">
              {items.map((t) => (
                <div key={t.id} className={styles.toast}>
                  <span className={styles.msg}>{t.message}</span>
                  {t.action ? (
                    <button
                      type="button"
                      className={styles.action}
                      aria-label={t.action.label}
                      onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
