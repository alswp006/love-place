/// OTP 로그인 순수 로직 — 웹판 `useSignInWithOtp`의 검증·에러 매핑 이식.
library;

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
final _codeRe = RegExp(r'^\d{6}$');
final _rateLimitRe = RegExp('rate.?limit', caseSensitive: false);

bool isValidEmail(String email) => _emailRe.hasMatch(email.trim());

bool isValidOtpCode(String code) => _codeRe.hasMatch(code.trim());

/// 메일 재전송 한도(레이트리밋) 에러 판별 — 친화 카피로 매핑(R3.6).
bool isRateLimited({String? message, String? statusCode}) {
  if (statusCode == '429') return true;
  return message != null && _rateLimitRe.hasMatch(message);
}

const invalidEmailMsg = '올바른 이메일 주소를 입력해주세요.';
const invalidCodeMsg = '6자리 코드를 입력해주세요.';
const rateLimitedMsg = '잠시 후 다시 시도해 주세요 (메일 재전송 한도)';
const notConfiguredMsg = 'Supabase 설정이 아직 없어요. dart-define으로 URL·키를 넣어주세요.';
