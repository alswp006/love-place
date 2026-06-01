import { useRouteError, useNavigate, isRouteErrorResponse } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'

// 라우트 errorElement — lazy 청크 로드 실패(약전파/배포 직후)·렌더 오류 시 죽은 화면 대신
// 친근한 에러 + 재시도(web-stack.md §5 / ux-and-accessibility.md §7 '에러 상태 = 인라인+재시도').
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : '알 수 없는 오류가 발생했어요'

  return (
    <div role="alert" aria-live="assertive">
      <EmptyState
        emoji="🌧️"
        title="잠시 문제가 생겼어요"
        hint={`${message} — 네트워크가 불안정하면 잠시 후 다시 시도해 주세요.`}
        action={
          <button
            type="button"
            onClick={() => {
              // 청크 로드 실패는 재요청으로 대부분 복구되므로 전체 새로고침으로 깨끗이 재시도.
              navigate(0)
            }}
          >
            다시 시도
          </button>
        }
      />
    </div>
  )
}
