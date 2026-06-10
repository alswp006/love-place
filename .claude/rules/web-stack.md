# 웹 스택 규약 (web-stack)

> 소스 오브 트루스: `여행관리앱_설계서.md`. 선행 게이트(§2)는 **웹앱**으로 해소됨 — React + Vite + TS + PWA, 백엔드 Supabase(설계서 B안). 이 결정에 반하는 내용 금지(Expo/RN·SwiftUI·CloudKit 아님). 모든 API 키는 Edge Function 프록시(§2.1, §10.1)에만 둔다.

이 문서는 **구현 계약**이다. 아래 패턴을 그대로 따른다.

---

## 1. Vite + React + TS 설정

- **빌드/런타임:** Vite + `@vitejs/plugin-react`, React 18, TypeScript **strict**.
- **`tsconfig.json` 필수값:**
  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "react-jsx",
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true,
      "verbatimModuleSyntax": true,
      "skipLibCheck": true,
      "baseUrl": ".",
      "paths": { "@/*": ["src/*"] }
    }
  }
  ```
  경로 별칭 `@/` → `src/`. Vite 쪽에도 동일 alias 등록(`resolve.alias`).
- **PWA:** `vite-plugin-pwa`(Workbox). `manifest`에 이름·아이콘·`display: standalone`·`theme_color`. **iOS 홈화면 추가** 지원(설계서 웹 트레이드오프). 오프라인 셸 캐시는 정적 자산만; Supabase 데이터 쓰기는 §6 오프라인 큐로 처리(Workbox가 mutation 큐를 대신하지 않음).
- **게이트(코딩 규약):** `tsc --noEmit` 0, `vitest`, `vite build`, Playwright 비주얼 스모크. 이 넷이 통과해야 머지.
- **엄수:** `any` 금지(불가피하면 `unknown` + 좁히기). 외부 응답(카카오/Claude/Supabase row)은 경계에서 zod 등으로 파싱 후 타입 신뢰.

---

## 2. 폴더 구조 (설계서 §폴더 구조)

```
src/
  pages/        # 라우트 단위 화면(지도/일정/장소/추천/우리 + auth/onboarding)
  components/   # 재사용 UI(빈 상태·로딩 스켈레톤 포함)
  lib/          # supabase 클라이언트, kakao 로더, anthropic 타입, utils
  hooks/        # useXxxQuery / useXxxMutation / useRealtime…
  state/        # 전역(세션·couple·오프라인 큐). 서버 상태는 TanStack Query가 정본
  styles/       # 토큰(색/타이포/다크모드), 글로벌 CSS
  __tests__/    # vitest 단위/통합
supabase/
  migrations/   # SQL 마이그레이션(RLS 포함)
  functions/<edge-fn>/  # Deno Edge Functions(프록시)
e2e/            # Playwright 비주얼 스모크
public/         # manifest, 아이콘, 정적 자산
```

- `lib/supabase.ts` — 클라이언트 싱글턴.
- `lib/kakao.ts` — 카카오맵 JS SDK 동적 로더.
- `lib/anthropic-types.ts` — AI 경로 구조화 출력 타입(클라이언트는 **타입만**; 호출은 프록시).
- `lib/utils.ts` — 순수 유틸(색 도출, region 파싱 등).
- 한 파일에 페이지+훅+쿼리를 섞지 않는다. 데이터 접근은 `hooks/`로 격리.

---

## 3. 환경변수 (설계서 §10.1 — 키 클라이언트 금지)

- **클라이언트에 노출 가능한 값만 `VITE_` 접두**로 `.env`에 둔다. Vite는 `VITE_` 접두 변수만 번들에 주입한다 — 즉 `VITE_*`는 **전부 공개값으로 간주**한다.
- 허용(공개):
  ```
  VITE_SUPABASE_URL=https://xxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...        # anon 키는 공개 전제 + RLS가 실제 방어선
  VITE_KAKAO_JS_KEY=...                 # 도메인 제한된 JS키만(§5)
  ```
- **절대 금지(클라이언트 번들/`VITE_`에 넣지 말 것):**
  - Supabase **service_role 키**(RLS 우회 = 전 데이터 노출).
  - 카카오 **REST 키**(로컬 검색·길찾기 — 프록시 전용).
  - **Anthropic API 키**, 카카오모빌리티/TMap 키, GitHub 토큰(블로그 발행).
  이 비공개 키들은 **Supabase Edge Function의 시크릿**(`supabase secrets set`)으로만 보관하고 함수 런타임에서 `Deno.env`로 읽는다.
- `.env`는 `.gitignore`. `.env.example`에 키 **이름만**(값 없이) 커밋.
- anon 키는 공개돼도 안전한 설계여야 한다 — **모든 공유 테이블 RLS가 진짜 방어선**(설계서 §10.2). anon 키 노출을 RLS 부재의 변명으로 쓰지 않는다.

---

## 4. Supabase — 클라이언트·Auth·Realtime·TanStack Query

### 4.1 클라이언트 초기화 (`lib/supabase.ts`)
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types' // supabase gen types로 생성

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('Missing Supabase env')

export const supabase = createClient<Database>(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
```
- 싱글턴 1개만 export. 컴포넌트에서 `createClient` 재호출 금지.
- DB 타입은 `supabase gen types typescript`로 생성해 `Database`로 주입(쿼리 타입 안전).

### 4.2 Auth (설계서 §10.3 — 2인 단순)
- 매직링크(OTP) 또는 OAuth. `detectSessionInUrl: true`로 콜백 처리.
- 세션은 `state/`의 세션 컨텍스트(`onAuthStateChange` 구독)로 단일 관리. 라우트 가드는 세션 + `couples.status === ACTIVE` 기준.
- 커플 바인딩: **1회용·만료·1:1** 초대코드(설계서 §10.3). 코드 발급/검증·연결은 **Edge Function(또는 RLS+RPC)**에서 원자적으로 — 멤버 ≤2, `user_a/user_b` 정본, `profiles.couple_id`는 캐시.
- 로그아웃·계정 전환 시 TanStack Query 캐시를 `queryClient.clear()`로 비운다(타 couple 데이터 잔존 금지).

### 4.3 Realtime 구독 (설계서 §5.1 공유 자동 전파)
- `supabase.channel(...)` + `postgres_changes`로 couple 범위 테이블 변경 구독. 채널은 **커스텀 훅에서 생성하고 cleanup에서 `removeChannel`**(누수·중복 구독 금지).
```ts
useEffect(() => {
  const ch = supabase
    .channel(`places:${coupleId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'places', filter: `couple_id=eq.${coupleId}` },
      (payload) => queryClient.invalidateQueries({ queryKey: ['places', coupleId] }))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}, [coupleId, queryClient])
```
- Realtime 페이로드를 직접 state에 머지하지 말고 **관련 쿼리 무효화**로 일원화(서버가 정본, race 단순화). soft-delete(`deleted_at`) 행은 쿼리/뷰에서 제외.
- Realtime 활성화할 테이블은 마이그레이션에서 publication에 추가. RLS가 Realtime에도 적용됨을 전제(타 couple 변경 미수신).

### 4.4 TanStack Query 패턴 (서버 상태 정본)
- 서버 데이터는 **전부 TanStack Query**로. 수동 `useState`+`useEffect` fetch 금지.
- 쿼리 키 규약: `[리소스, coupleId, ...파라미터]` (예: `['wishes', coupleId]`, `['trip', tripId]`). coupleId를 항상 포함해 커플 격리.
- **낙관적 락(설계서 §4.3):** mutation은 `version` 조건부 update(`.eq('version', expected)`)로 보내고, **0행 반환 = 충돌**로 감지해 사용자에게 표시(LWW 금지). 성공 시 `version` 증가는 서버/트리거가.
- 낙관적 업데이트는 `onMutate`에서 적용, `onError`에서 롤백, `onSettled`에서 invalidate. Realtime 무효화와 충돌하지 않게 키 일치.
- `QueryClient` 기본값: `staleTime` 합리적 설정(Realtime이 무효화를 밀어주므로 과도한 refetch 회피), 네트워크 끊김 시 재시도 정책 명시.

---

## 5. 지도 SDK 로딩 (설계서 §5.5 / D5: 네이버 정본)

> 정본: 지도 표시·장소 검색 모두 네이버. 카카오 코드는 롤백용 보존, 미사용. 아래 카카오 예시는 동적 로더 패턴 참고용.

- **표시(지도/마커/클러스터)는 네이버 지도 JS SDK v3**(`lib/naver/loadNaverMaps.ts`, `ncpKeyId` 동적 로더). `VITE_NAVER_MAP_CLIENT_ID`(NCP Web Dynamic Map, 도메인 등록). 클러스터링은 네이버 MarkerClustering 샘플 포함.
- 스크립트는 `index.html` 정적 태그가 아니라 **동적 로더**로(키가 빌드 시 들어가고, 1회만 로드, `autoload=false`):
```ts
// lib/kakao.ts
let p: Promise<void> | null = null
export function loadKakaoMaps(): Promise<void> {
  if (p) return p
  const key = import.meta.env.VITE_KAKAO_JS_KEY
  p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer,services`
    s.async = true
    s.onload = () => window.kakao.maps.load(() => resolve())
    s.onerror = () => reject(new Error('Kakao SDK load failed'))
    document.head.appendChild(s)
  })
  return p
}
```
- `window.kakao` 전역은 `src/lib/kakao.d.ts`(또는 `@types`)로 타입 선언. 지도 컴포넌트는 `loadKakaoMaps()` 완료 후 init, 언마운트 시 리스너 정리.
- **REST는 SDK가 아니다 — 프록시 경유 필수:**
  - 카카오 **로컬 키워드 검색**(자동완성, §5.2) → REST 키 → **Edge Function 프록시**.
  - 카카오모빌리티/TMap **길찾기·이동시간**(§5.6) → REST/모빌리티 키 → **프록시**.
  JS키로 REST를 호출하지 않는다. REST 키를 클라이언트에 두지 않는다.
- SDK 로드 실패/오프라인 시 빈 상태·재시도 UI(설계서 코딩 규약 — 로딩/에러 디테일).

---

## 6. 오프라인 큐 (설계서 §4.3 — 이동 중 약전파)

- 쓰기는 로컬 큐(IndexedDB)에 쌓고 재연결 시 동기화. 큐 로직은 `state/`(또는 `lib/`)에 격리. TanStack Query 낙관적 업데이트와 결합해 UI 즉시 반영, 동기화 시 `version` 충돌은 사용자에게 표시.
- P1부터 동기화/충돌/오프라인을 테스트에 포함(횡단 트랙).

---

## 7. 라우팅

- React Router(데이터 라우터 권장). 하단 탭바 5개 = 최상위 라우트(설계서 §3 IA):
  ```
  /          → 지도   (첫 화면)
  /calendar  → 일정
  /places    → 장소
  /discover  → 추천
  /us        → 우리(설정·연결·내보내기)
  ```
  + `/auth`(로그인/매직링크 콜백), `/onboarding`(초대·연결, 색상 선택, 위치·사진 상호 동의 — §8/§10.3).
- **가드:** 비로그인 → `/auth`. 로그인했으나 couple 미연결 → `/onboarding`. 둘 다 충족해야 탭 진입.
- 상세는 중첩/모달 라우트: `/places/:placeId`, `/places/trips/:tripId`, `/calendar/event/:eventId` 등. 딥링크 가능하게 placeId/tripId를 URL에.
- 코드 스플리팅: 페이지는 `React.lazy` + `Suspense`(로딩 스켈레톤). 지도·캘린더 등 무거운 모듈 지연 로드.

---

## 8. 안티패턴 (하면 안 되는 것)

- ❌ API 키 하드코딩 / 클라이언트 번들 포함(`VITE_`에 비공개 키 주입 포함).
- ❌ Supabase **service_role 키**를 프런트에 노출(= RLS 전면 무력화).
- ❌ 카카오 **REST 키**(로컬·길찾기)·**Anthropic 키**를 클라이언트에서 사용 — 반드시 Edge Function 프록시.
- ❌ RLS 없는 테이블에 의존(anon 키 공개 전제이므로 RLS가 유일 방어선, §10.2).
- ❌ 서버 상태를 `useState`+수동 fetch로 관리(→ TanStack Query).
- ❌ Realtime 채널 cleanup 누락(메모리 누수·중복 이벤트).
- ❌ LWW 무음 덮어쓰기(→ `version` 조건부 update로 충돌 감지).
- ❌ 색만으로 상태 구분(→ 색 + 패턴/라벨, 색각 이상 대응, §8).
- ❌ 빈 상태·로딩·에러 UI 생략(다층 빈 상태·스켈레톤 필수).
- ❌ `createClient` 다중 호출(싱글턴 1개).
