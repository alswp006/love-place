import 'package:flutter_test/flutter_test.dart';
import 'package:weave/places/save_place.dart';
import 'package:weave/region/parse_address.dart';

void main() {
  group('dedupKey — 웹판과 동일 규칙', () {
    test('좌표 미세변형(1e-5)은 같은 키로 흡수', () {
      final a = dedupKey(name: '카페', address: '서울', lat: 37.55561, lng: 126.89579);
      final b = dedupKey(name: '카페', address: '서울', lat: 37.55558, lng: 126.89581);
      expect(a, b); // round(4자리)
    });

    test('같은 건물 다른 가게(이름 다름)는 다른 키', () {
      final a = dedupKey(name: '1층카페', address: '서울', lat: 37.5, lng: 127.0);
      final b = dedupKey(name: '2층식당', address: '서울', lat: 37.5, lng: 127.0);
      expect(a, isNot(b));
    });

    test('키 형식: 이름|주소|lat|lng (소수 4자리 고정)', () {
      expect(
        dedupKey(name: 'n', address: 'a', lat: 37.5, lng: 127.0),
        'n|a|37.5000|127.0000',
      );
    });
  });

  group('parseAddress — 웹판 parseKakaoAddress와 동일', () {
    test('도+시: "강원특별자치도 속초시" → "속초"', () {
      expect(parseAddress('강원특별자치도 속초시 청호동 1').regionLabel, '속초');
    });
    test('광역시 구: "서울 마포구" → "마포구"', () {
      expect(parseAddress('서울 마포구 마포나루길 467').regionLabel, '마포구');
    });
    test('"제주특별자치도 제주시" → "제주"(웹판 코드 동작 기준)', () {
      expect(parseAddress('제주특별자치도 제주시 애월읍').regionLabel, '제주');
    });
    test('시군구 없으면 시도 라벨: "서울특별시" → "서울"', () {
      expect(parseAddress('서울특별시').regionLabel, '서울');
    });
    test('null/빈 문자열 → null', () {
      expect(parseAddress(null).regionLabel, isNull);
      expect(parseAddress('  ').regionLabel, isNull);
    });
    test('regionCode는 P1에선 항상 null(시드 밖 지역 FK 안전)', () {
      expect(parseAddress('서울 마포구').regionCode, isNull);
    });
  });
}
