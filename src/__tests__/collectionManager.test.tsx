import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionManager } from '@/components/places/CollectionManager'
import type { CollectionRow } from '@/hooks/useCollections'

function setup(over: Partial<Parameters<typeof CollectionManager>[0]> = {}) {
  const props: Parameters<typeof CollectionManager>[0] = {
    open: true,
    onClose: vi.fn(),
    collections: [],
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    busy: false,
    ...over,
  }
  render(<CollectionManager {...props} />)
  return props
}

const one: CollectionRow[] = [{ id: 'c1', name: '데이트', version: 3 }]

describe('CollectionManager (목록 생성/이름변경/삭제)', () => {
  it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('이름 입력 후 만들기 → onCreate(name)', () => {
    const p = setup()
    fireEvent.change(screen.getByLabelText('새 목록 이름'), { target: { value: '맛집' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))
    expect(p.onCreate).toHaveBeenCalledWith('맛집')
  })

  it('빈 목록이면 안내 문구(죽은 화면 금지)', () => {
    setup({ collections: [] })
    expect(screen.getByText(/첫 목록을 만들어보세요/)).toBeInTheDocument()
  })

  it('삭제는 2단계 확인 후 onDelete(id, version)(낙관적 락용 version 전달)', () => {
    const p = setup({ collections: one })
    fireEvent.click(screen.getByRole('button', { name: '데이트 삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '삭제 확인' }))
    expect(p.onDelete).toHaveBeenCalledWith('c1', 3)
  })

  it('이름변경 → 저장 시 onRename(id, version, name)', () => {
    const p = setup({ collections: one })
    fireEvent.click(screen.getByRole('button', { name: '데이트 이름 변경' }))
    fireEvent.change(screen.getByLabelText('데이트 이름 수정'), { target: { value: '데이트코스' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(p.onRename).toHaveBeenCalledWith('c1', 3, '데이트코스')
  })
})
