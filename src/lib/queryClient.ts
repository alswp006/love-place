import { QueryClient } from '@tanstack/react-query'

// 서버 상태 정본(web-stack.md §4.4). Realtime이 무효화를 밀어주므로 과도한 refetch는 피한다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // Realtime 구독이 변경을 알려주므로 기본 신선도는 넉넉히
      retry: 1, // 약전파에서 무한 재시도 방지(§4.3 오프라인 큐가 별도 담당)
      refetchOnWindowFocus: false,
    },
  },
})
