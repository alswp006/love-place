import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor 설정 — webDir는 vite 빌드 산출물(dist). appId는 스토어 제출 후 변경 어려우니 첫 빌드 전 확정할 것.
// 백그라운드 위치/지오로케이션 plugin은 의도적으로 없음(R6 게이트). server.url(라이브리로드)은 기본 비활성.
const config: CapacitorConfig = {
  appId: 'app.loveplace',
  appName: 'love place',
  webDir: 'dist',
  ios: { contentInset: 'always' },
  // androidScheme=https로 두면 Android WebView origin이 https://localhost — 표준/안전(혼합콘텐츠 회피).
  server: { androidScheme: 'https' },
  plugins: {
    // 입력창이 키보드에 가리지 않게 WebView 리사이즈(P-A.5).
    Keyboard: { resize: 'native' },
    // 스플래시: 흰 깜빡임 대신 마시멜로 핑크 배경. 셸 마운트 후 initNative가 hide() 호출(launchAutoHide:false).
    SplashScreen: { launchAutoHide: false, backgroundColor: '#fff1f4', showSpinner: false },
  },
}

export default config
