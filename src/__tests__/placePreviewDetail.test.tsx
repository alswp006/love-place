import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlacePreviewDetail } from '@/components/places/PlacePreviewDetail'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

const hit: KakaoPlaceHit = { kakaoPlaceId: 'k1', name: '속초 "칠성조선소', address: '강원 속초시', lat: 38, lng: 128.5, category: '카페', placeUrl: 'https://x' }

describe('PlacePreviewDetail (미저장 검색 후보 — 시트 프리뷰)', () => {
  it('이름·카테고리·주소 표시 + [저장] → onSave', () => {
    const onSave = vi.fn()
    render(<PlacePreviewDetail hit={hit} saving={false} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByText('속초 "칠성조선소')).toBeInTheDocument()
    expect(screen.getByText(/카페/)).toBeInTheDocument()
    expect(screen.getByText(/강원 속초시/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
  it('닫기 → onClose', () => {
    const onClose = vi.fn()
    render(<PlacePreviewDetail hit={hit} saving={false} onSave={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('길찾기 버튼은 없다(spec §3.6 #5 제거)', () => {
    render(<PlacePreviewDetail hit={hit} saving={false} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /길찾기/ })).toBeNull()
  })
})
