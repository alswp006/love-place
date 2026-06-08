// 프록시 공통 타입 (03-proxy-contract.md §0.3)
export type ProxyErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_COUPLE_MEMBER'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'BAD_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'VALIDATION_FAILED'
  | 'TIMEOUT'

export type ProxyError = {
  ok: false
  code: ProxyErrorCode
  message: string
  retryAfterSec?: number
}

export const HTTP_FOR: Record<ProxyErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NOT_COUPLE_MEMBER: 403,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 402,
  BAD_REQUEST: 400,
  UPSTREAM_ERROR: 502,
  VALIDATION_FAILED: 422,
  TIMEOUT: 504,
}
