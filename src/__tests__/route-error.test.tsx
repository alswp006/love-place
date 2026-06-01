import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { RouteError } from '@/components/common/RouteError'

// 자식 렌더가 throw하면(= lazy 청크 로드 실패와 동일 경로) RouteError로 폴백하는지 검증(#2).
function Boom(): React.JSX.Element {
  throw new Error('chunk load failed')
}

describe('RouteError 바운더리', () => {
  it('자식 렌더 오류 시 친근한 에러 + 재시도 버튼을 보여준다(죽은 화면 방지)', async () => {
    // react-router가 errorElement로 폴백하며 콘솔에 에러를 찍으므로 노이즈만 억제.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const routes: RouteObject[] = [
      { path: '/', element: <Boom />, errorElement: <RouteError /> },
    ]
    const router = createMemoryRouter(routes, {
      initialEntries: ['/'],
      future: { v7_relativeSplatPath: true },
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('잠시 문제가 생겼어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    spy.mockRestore()
  })
})
