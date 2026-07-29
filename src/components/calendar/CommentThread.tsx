import { useState, type FormEvent } from 'react'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { Skeleton } from '@/components/common/Skeleton'
import { useComments, useAddComment, useDeleteComment, COMMENT_MAX_LEN } from '@/hooks/useComments'
import type { ProfileMap } from '@/hooks/useProfiles'
import { formatTime, dayKey } from '@/lib/calendar/eventDays'
import styles from './CommentThread.module.css'

// 일정 댓글 — 평면 목록 + 한 줄 입력. 대댓글·멘션 없음(ux §2 취지: 피드형 소셜 금지).
// "여기 주차 어려울 듯" 정도를 둘이 주고받는 자리다.
type Props = {
  coupleId: string | null
  myId: string | null
  eventId: string
  profiles: ProfileMap
  onConflict: () => void
}

/** 오늘이면 시각만, 다른 날이면 날짜까지(대화 흐름에서 날짜가 과하지 않게). */
function stamp(iso: string, todayKey: string): string {
  const k = dayKey(iso)
  return k === todayKey ? formatTime(iso) : `${k.slice(5)} ${formatTime(iso)}`
}

export function CommentThread({ coupleId, myId, eventId, profiles, onConflict }: Props) {
  const { data: comments, isLoading } = useComments(coupleId, eventId)
  const add = useAddComment(coupleId, myId, eventId)
  const del = useDeleteComment(coupleId, myId, eventId, onConflict)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const todayKey = dayKey(new Date().toISOString())
  const list = comments ?? []
  const tooLong = body.length > COMMENT_MAX_LEN

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text || tooLong || add.isPending) return
    setError(null)
    add.mutate(
      { body: text },
      {
        // 입력값 보존(§7): 실패하면 비우지 않고 인라인 에러 + 재시도 가능하게 남긴다.
        onSuccess: () => setBody(''),
        onError: (err) => setError(err instanceof Error ? err.message : '남기지 못했어요.'),
      },
    )
  }

  return (
    <section className={styles.wrap} aria-label="댓글">
      <h3 className={styles.title}>댓글{list.length > 0 ? ` ${list.length}` : ''}</h3>

      {isLoading ? (
        <Skeleton count={2} label="댓글 불러오는 중" />
      ) : list.length === 0 ? (
        <p className={styles.empty}>아직 댓글이 없어요. 먼저 한마디 남겨보세요.</p>
      ) : (
        // 상대가 남긴 댓글이 Realtime으로 들어오면 스크린리더에 알린다(§8 동적 변경 안내).
        <ul className={styles.list} aria-live="polite">
          {list.map((c) => {
            const mine = c.author_id === myId
            const name = profiles[c.author_id]?.displayName?.trim() || (mine ? '나' : '상대')
            return (
              <li key={c.id} className={styles.item}>
                <SourceAvatar userId={c.author_id} profiles={profiles} myId={myId} context=" 댓글" />
                <div className={styles.body}>
                  <div className={styles.meta}>
                    {/* 색만으로 누구인지 구분하지 않는다 — 이름 텍스트 병기(§8) */}
                    <span className={styles.author}>{name}</span>
                    <span className={styles.time}>{stamp(c.created_at, todayKey)}</span>
                  </div>
                  <p className={styles.text}>{c.body}</p>
                </div>
                {/* 삭제는 작성자만(RLS도 강제). 1탭=확인, 2탭=삭제 — 아젠다 삭제와 같은 계약. */}
                {mine ? (
                  confirmId === c.id ? (
                    <button
                      type="button"
                      className={styles.confirm}
                      onClick={() => {
                        setConfirmId(null)
                        del.mutate({ id: c.id, expectedVersion: c.version })
                      }}
                    >
                      정말 삭제할까요?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.del}
                      onClick={() => setConfirmId(c.id)}
                      aria-label="내 댓글 삭제"
                    >
                      <span aria-hidden>🗑</span>
                    </button>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <form className={styles.form} onSubmit={submit} aria-label="댓글 남기기">
        <input
          className={styles.input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="한마디 남기기"
          aria-label="댓글 내용"
          enterKeyHint="send"
          maxLength={COMMENT_MAX_LEN + 1} // 넘겨 입력은 막되, 넘긴 사실을 아래에서 알려준다
        />
        <button
          type="submit"
          className={styles.send}
          disabled={!body.trim() || tooLong || add.isPending}
        >
          {add.isPending ? '남기는 중…' : '남기기'}
        </button>
      </form>
      {tooLong ? (
        <p className={styles.error} role="alert">
          {COMMENT_MAX_LEN}자까지 쓸 수 있어요.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
