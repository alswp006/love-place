# love_place 정적 PWA — Railway 배포용 멀티스테이지 Dockerfile
# 1단계(builder): Node로 Vite 프로덕션 빌드 → dist/ 생성
# 2단계(runtime): Caddy로 dist/를 SPA 폴백과 함께 서빙
#
# 중요(Vite 빌드타임 환경변수):
#   VITE_* 변수는 RUNTIME이 아니라 BUILD 시점에 번들에 박힌다.
#   따라서 `npm run build`가 실행되는 builder 단계에서 값이 존재해야 한다.
#   Railway는 서비스 Variables를 build/runtime 모두에 주입하므로,
#   Variables 탭에 VITE_SUPABASE_URL 등을 넣으면 자동으로 ARG 없이도 들어온다.
#   (Dockerfile에서 명시적으로 받고 싶을 때만 아래 ARG/ENV 주석을 해제)

# ---------- 1) build ----------
FROM node:22-alpine AS builder
WORKDIR /app

# 의존성 레이어 캐시 최적화: lockfile 먼저 복사.
COPY package.json package-lock.json ./
RUN npm ci

# 소스 복사 후 빌드.
COPY . .

# Vite 빌드타임 환경변수 — Railway Dockerfile 빌드는 service Variables를
# 자동 주입하지 않으므로 반드시 ARG로 명시 선언해야 한다(미선언 시 빈 값이 번들에 박힘).
# 근거: Railway Docs — Dockerfiles(빌드타임 변수는 ARG 필요).
# 이 값들은 전부 공개 가능(anon 키=RLS가 방어선, 네이버 키=도메인 제한). service_role/카카오REST는 절대 여기 아님.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_NAVER_MAP_CLIENT_ID
ARG VITE_KAKAO_JS_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_NAVER_MAP_CLIENT_ID=$VITE_NAVER_MAP_CLIENT_ID \
    VITE_KAKAO_JS_KEY=$VITE_KAKAO_JS_KEY

# build = tsc --noEmit && vite build (package.json). dist/ 생성.
RUN npm run build

# ---------- 2) runtime ----------
FROM caddy:2-alpine AS runtime
WORKDIR /srv

# Caddy 설정과 빌드 산출물만 가져온다(node_modules·소스 제외 → 경량 이미지).
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist ./dist

# 컨테이너 안 작업 디렉터리에서 dist를 root로 잡으므로 위치 일관성 유지.
# Caddyfile은 root * dist 이며, /srv 기준 ./dist 를 가리킨다.
# Railway가 $PORT를 주입 → Caddyfile의 :{$PORT}가 수신.
EXPOSE 3000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
