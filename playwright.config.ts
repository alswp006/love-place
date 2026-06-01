import { defineConfig, devices } from '@playwright/test'

// 비주얼/기능 스모크 — 5탭 셸이 모바일 뷰포트에서 렌더되고 탭 네비게이션이 동작하는지(P0a DoD).
// 빌드 1회만: webServer가 미리 만들어진 dist를 preview로 서빙(CI는 build 스텝이 선행).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // 스냅샷 비교의 결정성을 위해 렌더 환경을 고정(머신 OS 설정에 종속되지 않게).
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
  },
  // 베이스라인 부재 시: 로컬은 생성(편의), CI는 실패(누락을 숨기지 않음).
  // 단 스냅샷은 OS 종속이라 CI 게이트의 본질은 기능 assertion(toBeVisible/URL)이며,
  // 픽셀 비교는 같은 OS에서만 의미가 있다(아래 toHaveScreenshot 호출은 darwin 한정 가드).
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  projects: [
    {
      // 모바일 뷰포트(모바일 Safari 근사)를 Chromium 엔진으로 — CI/로컬 모두 chromium 한 종만 설치.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // 프로덕션 빌드 산출물(dist)을 preview로 서빙. CI는 앞선 build 스텝의 dist를 재사용(재빌드 안 함).
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
