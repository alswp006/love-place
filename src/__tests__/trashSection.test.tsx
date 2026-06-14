import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrashSection } from '@/components/places/TrashSection'
import type { TrashPlaceRow } from '@/hooks/usePlaceTrash'

const item: TrashPlaceRow = {
  id: 't1', name: '지운 카페', address: null, region_label: null, deleted_at: '2026-06-14', version: 2,
}

describe('TrashSection (휴지통 추출)', () => {
  it('닫힌 상태에선 토글만 보이고 항목은 숨긴다', () => {
    render(<TrashSection open={false} onToggle={() => {}} items={[item]} busy={false} onRestore={() => {}} />)
    expect(screen.getByText(/휴지통/)).toBeInTheDocument()
    expect(screen.queryByText('지운 카페')).not.toBeInTheDocument()
  })

  it('열린 상태에서 복구 버튼 클릭 시 onRestore(item)을 호출한다', () => {
    const onRestore = vi.fn()
    render(<TrashSection open onToggle={() => {}} items={[item]} busy={false} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: '복구' }))
    expect(onRestore).toHaveBeenCalledWith(item)
  })

  it('열렸지만 비어 있으면 빈 카피를 보여준다', () => {
    render(<TrashSection open onToggle={() => {}} items={[]} busy={false} onRestore={() => {}} />)
    expect(screen.getByText('삭제한 장소가 없어요.')).toBeInTheDocument()
  })
})
