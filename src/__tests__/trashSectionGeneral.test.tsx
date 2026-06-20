import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrashSection } from '@/components/trash/TrashSection'
import type { TrashRow } from '@/hooks/useTrash'
import { daysUntilPurge } from '@/lib/trash/purgeDate'

// 통합 휴지통(R3 T17) — 이질적 엔티티를 한 섹션에서. kind 배지는 색만이 아닌 라벨 텍스트 병행(§4).
// 삭제일 + "N일 후 영구삭제"(purge horizon) 표시. 항목별 복구 → onRestore(row).

const place: TrashRow = { id: 'p1', label: '지운 카페', kind: 'places', deleted_at: '2026-06-01T00:00:00Z', version: 2 }
const event: TrashRow = { id: 'e1', label: '데이트', kind: 'events', deleted_at: '2026-06-10T00:00:00Z', version: 1 }
const photo: TrashRow = { id: 'ph1', label: '바닷가 사진', kind: 'photos', deleted_at: '2026-06-12T00:00:00Z', version: 3 }
const items = [place, event, photo]

describe('TrashSection (통합 휴지통 — kind 배지 + 삭제/영구삭제 예정일)', () => {
  it('닫힌 상태에선 토글만 보이고 항목은 숨긴다', () => {
    render(<TrashSection open={false} onToggle={() => {}} items={items} busy={false} onRestore={() => {}} />)
    expect(screen.getByText(/휴지통/)).toBeInTheDocument()
    expect(screen.queryByText('지운 카페')).not.toBeInTheDocument()
  })

  it('각 항목에 kind 배지(라벨 텍스트)와 항목 라벨을 색만이 아닌 텍스트로 보여준다(§4)', () => {
    render(<TrashSection open onToggle={() => {}} items={items} busy={false} onRestore={() => {}} />)
    // kind 라벨 텍스트(색 외 라벨 병행)
    expect(screen.getByText('장소')).toBeInTheDocument()
    expect(screen.getByText('일정')).toBeInTheDocument()
    expect(screen.getByText('사진')).toBeInTheDocument()
    // 항목 라벨
    expect(screen.getByText('지운 카페')).toBeInTheDocument()
    expect(screen.getByText('데이트')).toBeInTheDocument()
  })

  it('kind 배지는 색만이 아닌 aria-label(라벨)을 갖는다(색각 이상 대응 §4)', () => {
    render(<TrashSection open onToggle={() => {}} items={[place]} busy={false} onRestore={() => {}} />)
    expect(screen.getByLabelText('장소')).toBeInTheDocument()
  })

  it('삭제일과 "N일 후 영구삭제"(purge horizon)를 표시한다', () => {
    render(<TrashSection open onToggle={() => {}} items={[place]} busy={false} onRestore={() => {}} />)
    const deletedDate = new Date(place.deleted_at).toLocaleDateString('ko-KR')
    expect(screen.getByText(new RegExp(deletedDate))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${daysUntilPurge(place.deleted_at)}일 후 영구삭제`))).toBeInTheDocument()
  })

  it('복구 버튼을 누르면 onRestore(row)를 호출한다', () => {
    const onRestore = vi.fn()
    render(<TrashSection open onToggle={() => {}} items={[place]} busy={false} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: '복구' }))
    expect(onRestore).toHaveBeenCalledWith(place)
  })

  it('복구 중(busy)에는 복구 버튼이 비활성', () => {
    render(<TrashSection open onToggle={() => {}} items={[place]} busy onRestore={() => {}} />)
    expect(screen.getByRole('button', { name: '복구' })).toBeDisabled()
  })

  it('열렸지만 비어 있으면 통합 빈 카피를 보여준다', () => {
    render(<TrashSection open onToggle={() => {}} items={[]} busy={false} onRestore={() => {}} />)
    expect(screen.getByText('삭제한 항목이 없어요.')).toBeInTheDocument()
  })
})
