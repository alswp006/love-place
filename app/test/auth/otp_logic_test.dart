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
    test('6자리 숫자만 유효', () {
      expect(isValidOtpCode('123456'), isTrue);
      expect(isValidOtpCode(' 123456 '), isTrue);
      expect(isValidOtpCode('12345'), isFalse);
      expect(isValidOtpCode('1234567'), isFalse);
      expect(isValidOtpCode('12345a'), isFalse);
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
