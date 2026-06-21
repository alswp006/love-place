import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TrackLegend } from '@/components/calendar/TrackLegend'
import { TRACK_META, ALL_TRACKS } from '@/lib/calendar/track'

// Task 15(R4.4): 트랙 범례 — 명확성용 색+이름칩(비인터랙티브 legend).
// TrackChips(필터, 인터랙티브)와 구분. shared/mine/partner 3트랙 모두 표기.
// 라벨은 TRACK_META 단일출처(divergence 제거 → mine='나').
// 색 단독 금지(§8) → 색(swatch cssVar) + 심볼 + 텍스트 삼중 인코딩.
// vitest css:false → 클래스명 미적용. 검증은 인라인 style(background)·aria-hidden·텍스트 기준.

describe('TrackLegend', () => {
  it('shared(●)·mine(▲)·partner(■) 세 칩을 색+심볼+이름으로 렌더한다', () => {
    render(<TrackLegend />)

    for (const track of ALL_TRACKS) {
      const meta = TRACK_META[track]
      // 라벨은 TRACK_META 단일출처
      const li = screen.getByText(meta.label).closest('li')
      expect(li).not.toBeNull()
      // 심볼(패턴) 표기
      expect(within(li!).getByText(meta.symbol)).toBeInTheDocument()
      // 색 swatch(인라인 style background = cssVar)
      const swatch = li!.querySelector('span[aria-hidden][style]') as HTMLElement
      expect(swatch.style.background).toContain(meta.cssVar)
    }
  })

  it('partner(상대) 트랙도 범례에 명시한다(타임라인의 ■/partner 일관)', () => {
    render(<TrackLegend />)
    expect(screen.getByText(TRACK_META.partner.label)).toBeInTheDocument()
    expect(screen.getByText(TRACK_META.partner.symbol)).toBeInTheDocument()
  })

  it('비인터랙티브: 버튼 없이 ul/li 구조이며 심볼/swatch는 aria-hidden', () => {
    const { container } = render(<TrackLegend />)
    // 버튼/필터가 아님(인터랙티브 금지)
    expect(screen.queryByRole('button')).toBeNull()
    // ul/li 구조 — 3트랙
    const ul = container.querySelector('ul')
    expect(ul).not.toBeNull()
    expect(ul!.querySelectorAll('li').length).toBe(3)
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
