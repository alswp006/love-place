/// 캘린더 3트랙 도출 — 색은 저장하지 않고 런타임에 만든다(설계서 §5.1·§4.2 / CLAUDE.md §7).
///
/// 웹판 `src/lib/calendar/track.ts`의 이식. 도출 규칙은 한 글자도 바꾸지 않았다.
///
/// ## 왜 저장하지 않나
///
/// 트랙은 **보는 사람(viewer) 기준**이다. 같은 행을 내가 보면 `mine`, 상대가 보면 `partner`가
/// 나오는 게 정상이고 그래서 맞다. 이 값을 DB에 넣는 순간 한쪽 화면에서 반드시 틀린다.
/// 두 단말이 같은 규칙을 각자 돌려서 각자의 답을 얻는 구조여야 한다.
///
/// ## JS와 다르게 간 곳
///
/// 웹의 `TRACK_META.cssVar`는 `var(--c-track-shared)` 같은 **토큰 참조**라 라이트/다크 전환을
/// CSS가 알아서 했다. Dart엔 그런 늦은 바인딩이 없어 [trackColor]가 [Brightness]를 받아
/// 그 자리에서 고른다. 값 자체는 웹 OKLCH 토큰을 그대로 sRGB로 변환한 것이라 두 판이 같은
/// 색을 낸다(변환 검증: `lib/map/marker_icon.dart`의 brand/shared 값과 동일 파이프라인).
///
/// 그래서 웹의 `TRACK_META` 레코드는 둘로 갈렸다 — `label`은 [Track.label] 필드로(Dart의
/// enhanced enum엔 TS에 없는 이 자리가 있다), `cssVar`는 [trackColor] 함수로.
/// 맵 + `!` 조회를 쓰지 않은 이유이기도 하다: 절대 실패하지 않을 조회에 널 단언을 남기면
/// 호출부마다 `trackMeta[t]!.label`이 된다.
///
/// ## 여기까지가 이 파일의 몫
///
/// 웹판의 `TrackBadge`(아바타 + 이름)는 위젯이라 이식 대상이 아니다. 이 파일은 **트랙·라벨·색**
/// 까지만 책임진다. 배지를 만들 때 [Track.label]을 빼지 말 것 — 색 단독 구분 금지(§8)를
/// 실제로 지켜주는 건 아바타가 아니라 그 글자다(아바타는 프로필이 늦게 오면 빈 칸이 된다).
library;

import 'dart:ui' show Brightness, Color;

/// 3트랙. 선언 순서 = 화면에 칩이 놓이는 순서라, 웹판 `ALL_TRACKS`를 `Track.values`가 대신한다.
///
/// 웹은 리스트를 따로 export했지만 Dart는 enum이 순서를 이미 갖고 있어 중복 정의를 하지 않았다.
/// 대신 순서가 계약이라는 사실을 테스트로 못박는다.
enum Track {
  shared('함께'),
  mine('나'),
  partner('상대');

  const Track(this.label);

  /// 화면에 그대로 나가는 한국어 라벨. 웹판 `TRACK_META[...].label`과 같은 문구여야 한다.
  ///
  /// 색각 이상 대응(§8)의 본체가 이 글자다. 배지에서 아바타가 라벨을 대신할 수 있을 것 같아도
  /// 아니다 — 프로필이 늦게 오면 아바타는 빈 칸이 되고, 그 순간 남는 건 색뿐이다.
  final String label;
}

/// `events.visibility`의 **저장값**. DB 열거형 문자열이라 바꾸면 웹판과 어긋난다(상호운용 계약).
abstract final class EventVisibility {
  static const shared = 'SHARED';
  static const personal = 'PERSONAL';
}

/// SHARED=함께, PERSONAL=소유자 기준(내 것=mine, 상대 것=partner).
///
/// [myId]가 null이면(세션 로딩 중·비로그인) PERSONAL은 **partner로 안전 도출**한다.
/// 남의 일정을 잠깐이라도 '내 것'으로 칠하는 쪽이 더 나쁜 오답이기 때문이다 —
/// 색이 잘못 붙은 일정은 사용자가 자기 것으로 착각하고 손을 댄다.
///
/// [visibility]가 'SHARED'가 아니면 전부 PERSONAL 경로로 간다(웹판의 `if/else`와 동일).
/// 모르는 값이 왔을 때 던지지 않는 이유: 캘린더 렌더링은 알 수 없는 값 하나로 화면이 죽으면
/// 안 되고, 소유자 기준 도출이 'shared'로 넓게 칠하는 것보다 보수적이다.
///
/// 웹판은 구조적 타이핑 덕에 이벤트 행을 통째로 넘겼지만(`deriveTrack(e, myId)`), Dart엔
/// 그게 없어 필요한 두 필드만 이름 인자로 받는다. 이벤트 모델이 뭐가 되든 호출부가 안 깨진다.
/// [myId]를 nullable이면서 `required`로 둔 건 의도다 — '아직 모른다'는 호출부가 생각하고
/// 넘겨야 할 상태지, 기본값으로 흘려보낼 값이 아니다.
Track deriveTrack({
  required String visibility,
  required String ownerId,
  required String? myId,
}) {
  if (visibility == EventVisibility.shared) return Track.shared;
  return myId != null && ownerId == myId ? Track.mine : Track.partner;
}

/// 웹 OKLCH 토큰 → sRGB. (light, dark) 쌍이며 정본은 웹판 `src/styles/tokens.css`다.
///
/// `marker_icon.dart`의 `MarkerPalette`와 값이 겹치는 게 있지만(브랜드 핑크·라벤더) 일부러
/// 복사했다. 캘린더 로직이 지도 위젯 파일을 import하면 순수 로직에 Flutter 위젯 트리가
/// 딸려 들어온다 — 정본은 어차피 양쪽 다 웹 토큰이고, 어긋나면 테스트가 잡는다.
abstract final class TrackPalette {
  // 출처 토큰(라이트 / 다크). 색조는 같고 L만 올라간다 — 다크에서 진한 색이 묻히기 때문.
  //   mine    --mint-ink     oklch(52% .11 165) / oklch(78% .11 165)
  //   partner --pink-600     oklch(53% .15 8)   / oklch(78% .13 8)
  //   shared  --lavender-ink oklch(52% .13 295) / oklch(78% .11 295)
  //
  // 함정: mine 라이트는 OKLCH → 선형 sRGB에서 R이 -0.0008로 아주 살짝 색역 밖이다.
  // 브라우저가 0으로 자르므로 웹 화면의 실제 색도 R=0이고, 그래서 여기 값과 일치한다.
  // (웹판 `inSrgbGamut`의 허용 오차 ±0.001 안이라 그쪽 게이트도 통과한다.)
  static const mineLight = Color(0xFF007C59);
  static const mineDark = Color(0xFF6CCEA6);
  static const partnerLight = Color(0xFFB03D5B);
  static const partnerDark = Color(0xFFFD93A7);
  static const sharedLight = Color(0xFF6F57AB);
  static const sharedDark = Color(0xFFBCA9F7);
}

/// 트랙 색 — 저장값이 아니라 [brightness]와 함께 그 자리에서 고르는 값(§7).
Color trackColor(Track track, Brightness brightness) {
  final dark = brightness == Brightness.dark;
  return switch (track) {
    Track.shared => dark ? TrackPalette.sharedDark : TrackPalette.sharedLight,
    Track.mine => dark ? TrackPalette.mineDark : TrackPalette.mineLight,
    Track.partner =>
      dark ? TrackPalette.partnerDark : TrackPalette.partnerLight,
  };
}
