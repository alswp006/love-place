import 'package:flutter_test/flutter_test.dart';
import 'package:weave/couple/invite_code.dart';

/// 초대 코드 — 서버 `gen_invite_code`, 웹판 `inviteCode.ts`와 **같은 규칙**이어야 한다.
/// 여기가 갈리면 한쪽에서 만든 코드를 다른 쪽이 거절한다(연결 자체가 막힌다).
void main() {
  group('normalizeInviteCode', () {
    test('하이픈·공백·소문자를 흡수한다 — 사용자는 섞어 넣는다', () {
      expect(normalizeInviteCode('abcd-2345'), 'ABCD2345');
      expect(normalizeInviteCode(' ABCD 2345 '), 'ABCD2345');
      expect(normalizeInviteCode('AB-CD-23-45'), 'ABCD2345');
    });

    test('영숫자가 아닌 문자는 전부 버린다', () {
      expect(normalizeInviteCode('ABCD_2345!'), 'ABCD2345');
    });
  });

  group('isValidInviteCode', () {
    test('8자 + 허용 문자셋이면 통과', () {
      expect(isValidInviteCode('ABCD2345'), isTrue);
      expect(isValidInviteCode('abcd-2345'), isTrue); // 정규화 후 판정
    });

    test('길이가 다르면 거절', () {
      expect(isValidInviteCode('ABCD234'), isFalse);
      expect(isValidInviteCode('ABCD23456'), isFalse);
      expect(isValidInviteCode(''), isFalse);
    });

    test('★ 혼동 문자(I·O·1·0)는 알파벳에 없다 — 불러주거나 손으로 적는 코드다', () {
      // 서버가 이 문자들을 만들지 않으므로, 들어오면 사용자가 잘못 읽은 것이다.
      // 여기서 걸러야 "유효하지 않은 코드"라는 서버 왕복 없이 바로 알려줄 수 있다.
      expect(isValidInviteCode('ABCDEFGI'), isFalse, reason: 'I는 1과 헷갈린다');
      expect(isValidInviteCode('ABCDEFGO'), isFalse, reason: 'O는 0과 헷갈린다');
      expect(isValidInviteCode('ABCDEFG1'), isFalse);
      expect(isValidInviteCode('ABCDEFG0'), isFalse);
    });

    test('허용된 숫자는 2-9', () {
      expect(isValidInviteCode('ABCD2389'), isTrue);
    });
  });

  group('formatInviteCode', () {
    test('8자는 4-4로 끊는다(불러주기 쉽게)', () {
      expect(formatInviteCode('ABCD2345'), 'ABCD-2345');
    });

    test('입력 중인 값은 망가뜨리지 않는다', () {
      // 타이핑 도중에 하이픈을 끼우면 커서가 튀고 지우기가 어려워진다.
      expect(formatInviteCode('ABC'), 'ABC');
      expect(formatInviteCode('ABCD234'), 'ABCD234');
    });
  });

  group('inviteReasonMessage', () {
    test('서버 사유를 사람 문장으로 — 웹판과 같은 문구여야 한다', () {
      // 같은 상황에서 두 앱이 다른 말을 하면 사용자가 둘 중 하나를 오작동으로 의심한다.
      expect(inviteReasonMessage('EXPIRED'), contains('48시간'));
      expect(inviteReasonMessage('SELF_INVITE'), contains('본인이 만든'));
      expect(inviteReasonMessage('ALREADY_COUPLED'), contains('이미 연결된'));
    });

    test('★ HAS_OWN_DATA는 방향을 알려준다 — 코드를 넣는 쪽 데이터가 남는다', () {
      // 자동 병합을 하지 않는 결정이 이 문구로 사용자에게 전달된다.
      // 조용히 한쪽을 잃는 것보다 "반대로 하라"고 말하는 편이 낫다.
      expect(inviteReasonMessage('HAS_OWN_DATA'), contains('반대로'));
    });

    test('모르는 사유도 죽지 않고 일반 문구를 준다', () {
      expect(inviteReasonMessage('WHATEVER_NEW_REASON'), isNotEmpty);
    });
  });

  test('공유 문구에 코드와 유효기간이 들어간다', () {
    final t = inviteShareText('ABCD2345');
    expect(t, contains('ABCD-2345'));
    expect(t, contains('48시간'));
  });
}
