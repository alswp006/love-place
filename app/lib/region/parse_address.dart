/// 주소 문자열 → 지역 라벨(§4.2 region 이원화).
///
/// 웹판 `lib/region/parseKakaoAddress.ts`의 충실한 이식.
/// region_label = 시/군/구 단위 표시명(예: "속초", "마포구", "제주시").
/// region_code는 P1에선 null(시드 밖 지역도 FK 위반 없이 저장 — 0006).
library;

final _sidoSuffix = RegExp(r'(특별자치도|특별자치시|특별시|광역시|도|시)$');

typedef ParsedRegion = ({String? regionLabel, String? regionCode});

ParsedRegion parseAddress(String? address) {
  if (address == null || address.trim().isEmpty) {
    return (regionLabel: null, regionCode: null);
  }
  final parts = address.trim().split(RegExp(r'\s+'));
  final sido = parts.isNotEmpty ? parts[0] : '';
  final sigungu = parts.length > 1 ? parts[1] : '';

  if (sigungu.isNotEmpty) {
    // "속초시" → "속초", "제주시" → "제주". 2글자 이하("X시")만 유지(시 떼면 모호).
    // 웹판 주석은 "제주시 유지"라 하지만 코드(length>2 → 떼기)가 정본 — 동작을 맞춘다.
    final trimmed = (sigungu.endsWith('시') && sigungu.length > 2)
        ? sigungu.substring(0, sigungu.length - 1)
        : sigungu;
    return (regionLabel: trimmed, regionCode: null);
  }
  final sidoLabel = sido.replaceFirst(_sidoSuffix, '');
  return (
    regionLabel: sidoLabel.isEmpty ? null : sidoLabel,
    regionCode: null,
  );
}
