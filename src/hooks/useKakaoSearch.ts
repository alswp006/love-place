import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { KakaoPlaceHit, KakaoSearchRes, ProxyErrorRes } from '@/lib/kakao/types'

type State = {
  status: 'idle' | 'loading' | 'done' | 'error'
  hits: KakaoPlaceHit[]
  error: string | null
}

const DEBOUNCE_MS = 250

// 카카오 키워드 검색 자동완성(§5.2).
// - 디바운스 250ms(타이핑 멈춘 뒤 호출)
// - 취소 토큰(AbortController)으로 stale 응답 무시(race 방지)
// - 0건/오프라인/에러 폴백은 호출처(UI)가 status로 처리
export function useKakaoSearch() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<State>({ status: 'idle', hits: [], error: null })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 가장 마지막 요청만 반영하기 위한 순번 — supabase.functions.invoke는 AbortSignal을 받지 않으므로
  // stale 방어는 이 순번 가드로 한다(늦게 온 옛 응답 폐기).
  const seqRef = useRef(0)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setState({ status: 'idle', hits: [], error: null })
      return
    }
    if (!isSupabaseConfigured) {
      setState({ status: 'error', hits: [], error: '서버 연결 전이에요. (개발 중)' })
      return
    }

    const mySeq = ++seqRef.current

    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      // 검색 제공자: 네이버 지역검색(naver-search). 카카오로 롤백하려면 'kakao-search'로.
      const { data, error } = await supabase.functions.invoke<KakaoSearchRes | ProxyErrorRes>(
        'naver-search',
        { body: { query: trimmed } },
      )
      // 늦게 도착한 옛 응답은 버린다(최신 순번만 반영)
      if (mySeq !== seqRef.current) return

      if (error) {
        setState({ status: 'error', hits: [], error: '검색 중 문제가 생겼어요. 다시 시도해 주세요.' })
        return
      }
      if (!data || data.ok === false) {
        const msg = (data as ProxyErrorRes | null)?.message ?? '검색에 실패했어요.'
        setState({ status: 'error', hits: [], error: msg })
        return
      }
      setState({ status: 'done', hits: data.hits, error: null })
    } catch {
      if (mySeq !== seqRef.current) return
      setState({ status: 'error', hits: [], error: '네트워크가 불안정해요. 다시 시도해 주세요.' })
    }
  }, [])

  // query 변경 → 디바운스 후 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void runSearch(query), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  const clear = useCallback(() => {
    setQuery('')
    setState({ status: 'idle', hits: [], error: null })
  }, [])

  return { query, setQuery, clear, ...state }
}
