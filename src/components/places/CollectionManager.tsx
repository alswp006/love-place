import { useRef, useState } from 'react'
import { Dialog } from '@/components/common/Dialog'
import type { CollectionRow } from '@/hooks/useCollections'
import styles from './CollectionManager.module.css'

// 컬렉션(저장 목록) 관리 모달 — 생성 / 이름변경 / 삭제(soft). 공용 Dialog(포커스 트랩·ESC) 재사용.
// 삭제는 인라인 2단계 확인(파괴적 의도 강조, §8). version은 낙관적 락용으로 부모 mutation에 전달.
export function CollectionManager({
  open,
  onClose,
  collections,
  onCreate,
  onRename,
  onDelete,
  busy,
}: {
  open: boolean
  onClose: () => void
  collections: CollectionRow[]
  onCreate: (name: string) => void
  onRename: (id: string, version: number, name: string) => void
  onDelete: (id: string, version: number) => void
  busy: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault()
    const n = newName.trim()
    if (!n) return
    onCreate(n)
    setNewName('')
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="목록 관리" initialFocusRef={inputRef}>
      <h2 className={styles.title}>목록 관리</h2>

      <form className={styles.newRow} onSubmit={submitNew}>
        <input
          ref={inputRef}
          className={styles.input}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 목록 이름"
          aria-label="새 목록 이름"
          maxLength={40}
        />
        <button type="submit" className={styles.primary} disabled={busy || !newName.trim()}>
          만들기
        </button>
      </form>

      {collections.length === 0 ? (
        <p className={styles.empty}>첫 목록을 만들어보세요 — 장소를 주제별로 모을 수 있어요.</p>
      ) : (
        <ul className={styles.list}>
          {collections.map((c) => (
            <li key={c.id} className={styles.item}>
              {editingId === c.id ? (
                <>
                  <input
                    className={styles.input}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={`${c.name} 이름 수정`}
                    maxLength={40}
                  />
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy || !draft.trim()}
                    onClick={() => {
                      const n = draft.trim()
                      if (n && n !== c.name) onRename(c.id, c.version, n)
                      setEditingId(null)
                    }}
                  >
                    저장
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setEditingId(null)}>
                    취소
                  </button>
                </>
              ) : confirmId === c.id ? (
                <>
                  <span className={styles.name}>{c.name}</span>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => {
                      onDelete(c.id, c.version)
                      setConfirmId(null)
                    }}
                  >
                    삭제 확인
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setConfirmId(null)}>
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.name}>{c.name}</span>
                  <button
                    type="button"
                    className={styles.ghost}
                    aria-label={`${c.name} 이름 변경`}
                    onClick={() => {
                      setEditingId(c.id)
                      setDraft(c.name)
                    }}
                  >
                    이름변경
                  </button>
                  <button
                    type="button"
                    className={styles.dangerGhost}
                    aria-label={`${c.name} 삭제`}
                    onClick={() => setConfirmId(c.id)}
                  >
                    삭제
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={styles.close} onClick={onClose}>
        닫기
      </button>
    </Dialog>
  )
}
