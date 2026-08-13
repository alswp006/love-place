/// 빌드타임 환경값 — `--dart-define`으로 주입한다.
///
/// 여기 있는 값은 웹판 `VITE_` 접두 변수와 동일하게 **전부 공개값으로 간주**한다
/// (web-stack.md §3): anon 키는 공개 전제 + RLS가 실제 방어선, 네이버 지도 client id는
/// 앱 패키지/번들 제한. **비공개 키(네이버 REST·Anthropic·길찾기·service_role)는
/// 여기 절대 못 들어온다** — 전부 Edge Function 프록시에만 둔다(CLAUDE.md §5-1).
///
/// 빌드 예:
/// ```
/// flutter build ios --dart-define=SUPABASE_URL=... \
///   --dart-define=SUPABASE_ANON_KEY=... --dart-define=NAVER_MAP_CLIENT_ID=...
/// ```
library;

abstract final class Env {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const naverMapClientId = String.fromEnvironment('NAVER_MAP_CLIENT_ID');

  /// 웹판 `isSupabaseConfigured`와 같은 역할 — 미설정이면 쿼리를 돌리지 않고
  /// 빈 상태 UI로 폴백한다(하드크래시 금지, ux §7 에러 상태).
  static bool get supabaseConfigured =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  static bool get naverMapConfigured => naverMapClientId.isNotEmpty;
}
