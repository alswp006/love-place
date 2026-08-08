import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// 일정 댓글 — 평면 목록 + 한 줄 입력. 스레드·멘션 없음(ux §2 취지 유지).
// 삭제는 작성자만(RLS도 강제) + version 조건부(LWW 금지 §4.3).
const state = vi.hoisted(() => ({
  comments: [] as unknown[],
  isLoading: false,
  add: vi.fn(),
  del: vi.fn(),
  conflict: vi.fn(),
}))

vi.mock('@/hooks/useComments', async (orig) => {
  const real = await orig<typeof import('@/hooks/useComments')>()
  return {
    ...real, // COMMENT_MAX_LEN는 실제 값 사용
    useComments: () => ({ data: state.comments, isLoading: state.isLoading }),
    useAddComment: () => ({ mutate: state.add, isPending: false }),
    useDeleteComment: () => ({ mutate: state.del, isPending: false }),
  }
})

import { CommentThread } from '@/components/calendar/CommentThread'
import { COMMENT_MAX_LEN } from '@/hooks/useComments'

const profiles = {
  me: { id: 'me', displayName: '민제', color: '#3b6db5', avatarUrl: null, avatarPath: null },
  you: { id: 'you', displayName: '지민', color: '#e58', avatarUrl: null, avatarPath: null },
}

function renderThread() {
  return render(
    <CommentThread
      coupleId="c1"
      myId="me"
      eventId="e1"
      profiles={profiles}
      onConflict={state.conflict}
    />,
  )
}

const comment = (id: string, authorId: string, body: string, version = 1) => ({
  id,
  event_id: 'e1',
  body,
  author_id: authorId,
  created_at: new Date('2026-07-25T09:00:00+09:00').toISOString(),
  version,
})

beforeEach(() => {
  state.comments = []
  state.isLoading = false
  state.add.mockReset()
  state.del.mockReset()
  state.conflict.mockReset()
})

describe('CommentThread', () => {
  it('빈 상태는 죽은 화면 대신 한마디 유도', () => {
    renderThread()
    expect(screen.getByText(/먼저 한마디 남겨보세요/)).toBeInTheDocument()
  })

  it('로딩은 스켈레톤(§7)', () => {
    state.isLoading = true
    renderThread()
    expect(screen.getByLabelText('댓글 불러오는 중')).toBeInTheDocument()
  })

  it('양쪽 댓글을 모두 보여주고 작성자를 이름 텍스트로 구분한다(색만 의존 금지 §8)', () => {
    state.comments = [comment('c1', 'me', '주차 어려울 듯'), comment('c2', 'you', '지하철 타자')]
    renderThread()
    expect(screen.getByText('주차 어려울 듯')).toBeInTheDocument()
    expect(screen.getByText('지하철 타자')).toBeInTheDocument()
    expect(screen.getByText('민제')).toBeInTheDocument()
    expect(screen.getByText('지민')).toBeInTheDocument()
  })

  it('내용을 넣고 남기면 본문이 전달된다', () => {
    renderThread()
    fireEvent.change(screen.getByLabelText('댓글 내용'), { target: { value: '  여기 좋더라  ' } })
    fireEvent.click(screen.getByRole('button', { name: '남기기' }))
    expect(state.add).toHaveBeenCalledOnce()
    expect(state.add.mock.calls[0]![0]).toEqual({ body: '여기 좋더라' })
  })

  it('빈 내용이면 남기기 버튼이 비활성', () => {
    renderThread()
    expect(screen.getByRole('button', { name: '남기기' })).toBeDisabled()
  })

  it('상한을 넘기면 경고 + 전송 차단(서버 CHECK와 같은 값)', () => {
    renderThread()
    fireEvent.change(screen.getByLabelText('댓글 내용'), {
      target: { value: 'ㅇ'.repeat(COMMENT_MAX_LEN + 1) },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(`${COMMENT_MAX_LEN}자`)
    expect(screen.getByRole('button', { name: '남기기' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '남기기' }))
    expect(state.add).not.toHaveBeenCalled()
  })

  it('실패하면 입력값을 보존한다(§7 입력값 보존)', () => {
    state.add.mockImplementation((_v, opts) => opts?.onError?.(new Error('네트워크가 불안정해요.')))
    renderThread()
    const input = screen.getByLabelText('댓글 내용') as HTMLInputElement
    fireEvent.change(input, { target: { value: '날아가면 안 됨' } })
    fireEvent.click(screen.getByRole('button', { name: '남기기' }))
    expect(input.value).toBe('날아가면 안 됨')
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크가 불안정해요.')
  })

  it('성공하면 입력을 비운다', () => {
    state.add.mockImplementation((_v, opts) => opts?.onSuccess?.())
    renderThread()
    const input = screen.getByLabelText('댓글 내용') as HTMLInputElement
    fireEvent.change(input, { target: { value: '남길 말' } })
    fireEvent.click(screen.getByRole('button', { name: '남기기' }))
    expect(input.value).toBe('')
  })

  it('삭제 버튼은 내 댓글에만 뜬다(상대 댓글은 못 지운다)', () => {
    state.comments = [comment('c1', 'me', '내 것'), comment('c2', 'you', '상대 것')]
    renderThread()
    expect(screen.getAllByLabelText('내 댓글 삭제')).toHaveLength(1)
  })

  it('삭제는 1탭 확인 후 2탭에서 version 조건부로 나간다(LWW 금지 §4.3)', () => {
    state.comments = [comment('c1', 'me', '지울 것', 7)]
    renderThread()
    fireEvent.click(screen.getByLabelText('내 댓글 삭제'))
    // 1탭은 지우지 않는다 — 인라인 확인 먼저(아젠다 삭제와 같은 계약)
    expect(state.del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    expect(state.del).toHaveBeenCalledWith({ id: 'c1', expectedVersion: 7 })
  })

  it('Realtime 갱신을 스크린리더에 알린다(aria-live)', () => {
    state.comments = [comment('c1', 'you', '방금 도착')]
    renderThread()
    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite')
  })
})
