import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor 설정 — webDir는 vite 빌드 산출물(dist). appId는 스토어 제출 후 변경 어려우니 첫 빌드 전 확정할 것.
// 백그라운드 위치/지오로케이션 plugin은 의도적으로 없음(R6 게이트). server.url(라이브리로드)은 기본 비활성.
const config: CapacitorConfig = {
  appId: 'app.loveplace',
  appName: 'love place',
  webDir: 'dist',
  // contentInset은 never — 인셋은 CSS env(safe-area-inset-*)가 단일 소스다(viewport-fit=cover).
  // 'always'는 UIKit 스크롤뷰 인셋이 하단 safe-area를 한 번 더 먹어 탭바 아래 빈 띠를 만든다.
  ios: { contentInset: 'never' },
  // hostname을 배포 도메인으로: 네이버 지도 인증(/v3/auth)이 페이지 URL의 "호스트"만 검사하므로
  // 기본값(capacitor://localhost)이면 401로 지도가 죽는다. 등록 도메인과 호스트를 맞춰 인증 통과.
  // 이 origin은 Edge Function ALLOWED_ORIGINS에도 등록돼 있어야 한다(capacitor://<hostname>).
  // androidScheme=https라 Android origin은 https://<hostname>(웹 배포와 동일)이 된다.
  server: { androidScheme: 'https', hostname: 'love-place-production.up.railway.app' },
  plugins: {
    // 입력창이 키보드에 가리지 않게 WebView 리사이즈(P-A.5).
    Keyboard: { resize: 'native' },
    // 스플래시: 흰 깜빡임 대신 마시멜로 핑크 배경. 셸 마운트 후 initNative가 hide() 호출(launchAutoHide:false).
    SplashScreen: { launchAutoHide: false, backgroundColor: '#fff1f4', showSpinner: false },
  },
}

export default config
