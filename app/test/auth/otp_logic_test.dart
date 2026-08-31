import 'package:flutter_test/flutter_test.dart';
import 'package:weave/auth/otp_logic.dart';

void main() {
  group('이메일 검증 — 웹판 정규식과 동일', () {
    test('정상 이메일', () {
      expect(isValidEmail('a@b.co'), isTrue);
      expect(isValidEmail('  a@b.co  '), isTrue); // trim 후 판정
    });
    test('불량 이메일', () {
      expect(isValidEmail(''), isFalse);
      expect(isValidEmail('a@b'), isFalse); // 도메인 점 없음
      expect(isValidEmail('a b@c.d'), isFalse); // 공백
      expect(isValidEmail('@b.co'), isFalse);
    });
  });

  group('OTP 코드 검증', () {
    // 자릿수를 숫자로 박지 않는다 — Supabase의 mailer_otp_length가 정본이고 앱은 그걸 따른다.
    // 예전엔 6으로 박혀 있었는데 서버는 8이라, 코드가 와도 입력이 거부되는 상태였다(2026-08-31).
    final ok = '1' * otpLength;
    test('$otpLength자리 숫자만 유효 — 서버 설정과 같아야 한다', () {
      expect(isValidOtpCode(ok), isTrue);
      expect(isValidOtpCode(' $ok '), isTrue);
      expect(isValidOtpCode('1' * (otpLength - 1)), isFalse);
      expect(isValidOtpCode('1' * (otpLength + 1)), isFalse);
      expect(isValidOtpCode('${'1' * (otpLength - 1)}a'), isFalse);
    });
  });

  group('레이트리밋 판별 — 친화 카피 매핑(R3.6)', () {
    test('429 상태코드', () {
      expect(isRateLimited(statusCode: '429'), isTrue);
    });
    test('메시지의 rate limit 문구(변형 포함)', () {
      expect(isRateLimited(message: 'email rate limit exceeded'), isTrue);
      expect(isRateLimited(message: 'Rate-Limit hit'), isTrue);
      expect(isRateLimited(message: 'For security purposes...'), isFalse);
    });
    test('아무 정보 없으면 false', () {
      expect(isRateLimited(), isFalse);
    });
  });
}
