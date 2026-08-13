/// Supabase 클라이언트 싱글턴 — 웹판 `lib/supabase/client.ts`와 같은 규율.
///
/// 초기화는 앱 시작에서 한 번(`initSupabase`), 이후 접근은 전부 [db]로.
/// 컴포넌트/리포지토리에서 `Supabase.initialize` 재호출 금지(web-stack.md §8 안티패턴).
library;

import 'package:supabase_flutter/supabase_flutter.dart';

import 'env.dart';

/// 앱 시작에서 한 번 호출. [Env.supabaseConfigured]가 false면 아무것도 안 한다 —
/// 미설정 빌드(예: 골든 테스트)에서도 앱 셸은 떠야 한다.
Future<void> initSupabase() async {
  if (!Env.supabaseConfigured) return;
  await Supabase.initialize(
    url: Env.supabaseUrl,
    // supabase_flutter 2.17에서 anonKey → publishableKey로 개명(값은 기존
    // anon 키 그대로 받는다). 이름과 무관하게 공개 전제 + RLS가 실제 방어선.
    publishableKey: Env.supabaseAnonKey,
    // 세션 영속 + 자동 갱신은 supabase_flutter 기본값. 딥링크 세션 복원은
    // 인증 단계(OTP 우선)에서 다룬다 — 웹판이 네이티브에서 매직링크 PKCE
    // 교차컨텍스트를 피해 OTP 6자리를 1차로 둔 결정을 그대로 따른다.
  );
}

/// 전역 접근자. [initSupabase] 이후에만 유효하다.
SupabaseClient get db => Supabase.instance.client;
