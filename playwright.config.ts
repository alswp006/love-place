import { defineConfig, devices } from '@playwright/test'

// 비주얼 스모크 — 모바일 Safari 근사 뷰포트(설계서 §8 / web-stack.md). 핵심 5탭 셸 렌더.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // 플랫폼별 스냅샷 베이스라인이 없으면 실패 대신 생성(로컬 darwin ↔ CI linux 렌더 차이 대응).
  // 렌더 자체가 깨지면 다른 assertion(toBeVisible)이 잡는다.
  updateSnapshots: 'missing',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // 모바일 뷰포트(모바일 Safari 근사)를 Chromium 엔진으로 구동 —
      // CI/로컬 모두 chromium 한 종만 설치하면 되도록(WebKit 미설치 회피).
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // 프로덕션 빌드를 preview로 서빙해 스모크(실제 배포 산출물 검증).
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
