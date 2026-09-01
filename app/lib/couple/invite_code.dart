/// 초대 코드 유틸 — 서버 `gen_invite_code`, 웹판 `inviteCode.ts`와 **같은 규칙**이어야 한다.
///
/// 8자 Base32이되 혼동 문자를 뺐다: `I`·`O`·`1`·`0`이 없다. 코드를 카톡으로 불러주거나 손으로
/// 옮겨 적는 상황이 전제라, `O`와 `0`을 구분하게 만드는 순간 실패한다.
///
/// 정규화를 클라이언트에서도 하는 이유: 사용자는 하이픈·공백·소문자를 섞어 넣는다. 서버도
/// 같은 정규화를 하지만, 그 전에 걸러야 "유효하지 않은 코드"라는 잘못된 메시지를 안 띄운다.
library;

const _alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/// 대문자 + 영숫자만 남긴다(하이픈·공백·소문자 흡수). 서버 정규화와 동일.
String normalizeInviteCode(String raw) =>
    raw.toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '');

/// 표시용 4-4 분할(`ABCD-2345`). 8자가 아니면 그대로 둔다 — 입력 중인 값을 망가뜨리지 않게.
String formatInviteCode(String code) {
  final n = normalizeInviteCode(code);
  return n.length == 8 ? '${n.substring(0, 4)}-${n.substring(4)}' : n;
}

/// 제출 전 가드. 서버를 부르기 전에 형식을 거른다.
bool isValidInviteCode(String raw) {
  final n = normalizeInviteCode(raw);
  return n.length == 8 && n.split('').every(_alphabet.contains);
}

/// 카톡 등으로 보낼 문구.
String inviteShareText(String code) =>
    '우리 여행앱 Weave에서 연결해요! 초대코드: ${formatInviteCode(code)} (48시간 내 입력)';

/// 서버가 돌려주는 실패 사유 → 사람이 읽을 문장.
///
/// 문구는 웹판과 같아야 한다 — 같은 상황에서 두 앱이 다른 말을 하면 사용자가 둘 중 하나를
/// 오작동으로 의심한다.
String inviteReasonMessage(String reason) => switch (reason) {
      'AUTH_REQUIRED' => '로그인이 필요해요.',
      'INVALID_CODE' => '유효하지 않은 코드예요. 코드를 다시 확인하거나 새 코드를 받아 주세요.',
      'EXPIRED' => '초대 코드가 만료됐어요(유효 48시간). 상대에게 새 코드를 받아 주세요.',
      'SELF_INVITE' => '본인이 만든 코드예요. 이 코드를 상대에게 전달해 주세요.',
      'ALREADY_COUPLED' =>
        '이미 연결된 상대가 있어요. 새로 연결하려면 [우리]에서 먼저 연결을 해제해 주세요.',
      'PARTNER_TAKEN' => '상대가 방금 다른 분과 연결됐어요. 새 코드를 받아 주세요.',
      'NOT_MEMBER_OR_NOT_ACTIVE' => '연결을 해제할 수 없어요. 이미 해제됐거나 권한이 없어요.',
      // 0024: 양쪽 다 혼자 쓰면서 각자 데이터를 쌓은 경우. 합치기는 병합 문제라 자동으로 하지
      // 않는다 — 조용히 한쪽을 잃는 것보다 이렇게 말하는 편이 낫다.
      'HAS_OWN_DATA' =>
        '이미 혼자 담아둔 장소·일정이 있어요. 지금 연결하면 한쪽 기록만 남아요. '
            '반대로 상대에게 코드를 받아 연결해 주세요.',
      _ => '일시적인 오류예요. 잠시 후 다시 시도해 주세요.',
    };
