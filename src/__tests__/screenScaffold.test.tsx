import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'

describe('ScreenScaffold', () => {
  it('기본(non-fullBleed)은 헤더(h1)와 testId를 렌더한다', () => {
    render(<ScreenScaffold title="지도" subtitle="부제" testId="page-map">본문</ScreenScaffold>)
    expect(screen.getByTestId('page-map')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument()
    expect(screen.getByText('본문')).toBeInTheDocument()
  })

  it('fullBleed면 시각적 헤더(타이틀/부제)를 생략하되 testId와 접근성 이름은 유지한다', () => {
    render(
      <ScreenScaffold title="지도" subtitle="부제" testId="page-map" fullBleed>
        본문
      </ScreenScaffold>,
    )
    // testId 유지(라우팅 테스트 page-map 보존).
    expect(screen.getByTestId('page-map')).toBeInTheDocument()
    // 시각적 라지 타이틀/부제는 렌더하지 않는다(풀블리드).
    expect(screen.queryByText('부제')).not.toBeInTheDocument()
    // 그러나 section은 접근성 이름(landmark)을 유지한다.
    expect(screen.getByRole('region', { name: '지도' })).toBeInTheDocument()
    expect(screen.getByText('본문')).toBeInTheDocument()
  })
})
