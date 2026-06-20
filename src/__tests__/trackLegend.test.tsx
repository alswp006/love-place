import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TrackLegend } from '@/components/calendar/TrackLegend'
import { TRACK_META } from '@/lib/calendar/track'

// Task 14(R2.3): 트랙 범례 — 명확성용 색+이름칩(비인터랙티브 legend).
// TrackChips(필터, 인터랙티브)와 구분. authoring 2트랙(함께/내 일정)만 표기.
// 색 단독 금지(§8) → 색(swatch cssVar) + 심볼 + 텍스트 이중화.
// vitest css:false → 클래스명 미적용. 검증은 인라인 style(background)·aria-hidden·텍스트 기준.

describe('TrackLegend', () => {
  it('함께(●)·내 일정(▲) 칩을 색+심볼+이름으로 렌더한다', () => {
    render(<TrackLegend />)

    // 함께 칩: 텍스트 + 심볼 ● + 색 swatch
    const shared = screen.getByText('함께').closest('li')
    expect(shared).not.toBeNull()
    expect(within(shared!).getByText(TRACK_META.shared.symbol)).toBeInTheDocument()
    const sharedSwatch = shared!.querySelector('span[aria-hidden][style]') as HTMLElement
    expect(sharedSwatch.style.background).toContain(TRACK_META.shared.cssVar)

    // 내 일정 칩(라벨은 '내 일정', TRACK_META.mine.label='나'와 의도적 불일치): 심볼 ▲ + mine 색
    const mine = screen.getByText('내 일정').closest('li')
    expect(mine).not.toBeNull()
    expect(within(mine!).getByText(TRACK_META.mine.symbol)).toBeInTheDocument()
    const mineSwatch = mine!.querySelector('span[aria-hidden][style]') as HTMLElement
    expect(mineSwatch.style.background).toContain(TRACK_META.mine.cssVar)
  })

  it("viewer 전용 '상대'는 범례에 표기하지 않는다(authoring 2트랙)", () => {
    render(<TrackLegend />)
    expect(screen.queryByText('상대')).toBeNull()
  })

  it('비인터랙티브: 버튼 없이 ul/li 구조이며 심볼/swatch는 aria-hidden', () => {
    const { container } = render(<TrackLegend />)
    // 버튼/필터가 아님(인터랙티브 금지)
    expect(screen.queryByRole('button')).toBeNull()
    // ul/li 구조
    const ul = container.querySelector('ul')
    expect(ul).not.toBeNull()
    expect(ul!.querySelectorAll('li').length).toBe(2)
    // 접근성: 색 swatch·심볼은 aria-hidden(스크린리더는 텍스트 라벨만 읽음)
    for (const hidden of ul!.querySelectorAll('[aria-hidden]')) {
      expect(hidden.getAttribute('aria-hidden')).not.toBe('false')
    }
  })

  it('aria-label로 범례임을 안내한다', () => {
    render(<TrackLegend />)
    expect(screen.getByLabelText('일정 트랙 범례')).toBeInTheDocument()
  })
})
