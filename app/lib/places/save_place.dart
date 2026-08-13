/// 장소 저장(§5.2) — 웹판 `lib/places/savePlace.ts`의 충실한 이식.
///
/// 중복(kakao_place_id=네이버 합성키)이면 기존 카드로 점프, 아니면 insert +
/// 내 wish 추가. 합성키가 빗나가면 좌표창(±0.0001°) 폴백으로 같은 물리적 장소를
/// 잡는다.
///
/// wish는 upsert가 아니라 **select-then-insert**다: 유니크가 부분 인덱스
/// (`WHERE deleted_at IS NULL`)뿐이라 Postgres가 arbiter로 추론하지 못해
/// upsert가 42P10으로 터질 수 있다(웹판 주석 참조). plain UNIQUE로 바꾸는 것도
/// 안 된다 — soft-delete된 wish가 재찜을 막는다.
library;

import 'package:supabase_flutter/supabase_flutter.dart';

import '../region/parse_address.dart';
import '../search/place_hit.dart';

typedef SaveResult = ({String placeId, bool jumped});

/// 저장 시도의 결과 — 온라인 즉시 저장 또는 오프라인 큐 적재(웹판 useSavePlace의
/// SaveResult | null에 해당하되, null 대신 이름 있는 타입으로).
sealed class SaveOutcome {
  const SaveOutcome();
}

class SavedNow extends SaveOutcome {
  const SavedNow(this.result);
  final SaveResult result;
}

/// 오프라인: 큐에 적재됨 — 재연결 시 자동 동기화(유실 0, §4.3).
class QueuedOffline extends SaveOutcome {
  const QueuedOffline();
}

/// dedup 키(순수): 이름|주소|round(lat,4)|round(lng,4).
/// 같은 건물 다른 가게 구분 + 좌표 미세변형 흡수.
String dedupKey({
  required String name,
  required String address,
  required double lat,
  required double lng,
}) {
  String r(double n) => ((n * 1e4).round() / 1e4).toStringAsFixed(4);
  return '$name|$address|${r(lat)}|${r(lng)}';
}

Future<SaveResult> savePlace(
  SupabaseClient client,
  String coupleId,
  PlaceHit hit,
  String uid,
) async {
  String? placeId;
  var jumped = false;

  // 1) 이미 저장된 장소인가?(같은 커플 + 같은 합성키, soft-delete 제외)
  final existing = await client
      .from('places')
      .select('id')
      .eq('couple_id', coupleId)
      .eq('kakao_place_id', hit.kakaoPlaceId)
      .isFilter('deleted_at', null)
      .maybeSingle();
  if (existing != null) {
    placeId = existing['id'] as String;
    jumped = true;
  }

  // 1.5) 합성키가 빗나가면 좌표창 폴백.
  if (placeId == null) {
    const eps = 0.0001;
    final near = await client
        .from('places')
        .select('id, name, address, lat, lng')
        .eq('couple_id', coupleId)
        .isFilter('deleted_at', null)
        .gte('lat', hit.lat - eps)
        .lte('lat', hit.lat + eps)
        .gte('lng', hit.lng - eps)
        .lte('lng', hit.lng + eps);
    final key = dedupKey(
        name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng);
    for (final p in near) {
      final lat = p['lat'], lng = p['lng'];
      if (lat is! num || lng is! num) continue;
      final pKey = dedupKey(
        name: p['name'] as String,
        address: (p['address'] as String?) ?? '',
        lat: lat.toDouble(),
        lng: lng.toDouble(),
      );
      if (pKey == key) {
        placeId = p['id'] as String;
        jumped = true;
        break;
      }
    }
  }

  if (placeId == null) {
    final region = parseAddress(hit.address);
    final inserted = await client
        .from('places')
        .insert({
          'couple_id': coupleId,
          'name': hit.name,
          'address': hit.address,
          'region_code': region.regionCode,
          'region_label': region.regionLabel,
          'lat': hit.lat,
          'lng': hit.lng,
          'category': hit.category,
          'kakao_place_id': hit.kakaoPlaceId,
          'added_by': uid,
          'created_by': uid,
          'updated_by': uid,
        })
        .select('id')
        .single();
    placeId = inserted['id'] as String;
  }

  // 2) 내 wish 추가 — select-then-insert(사유는 파일 머리 주석).
  final mine = await client
      .from('wishes')
      .select('id')
      .eq('couple_id', coupleId)
      .eq('place_id', placeId)
      .eq('user_id', uid)
      .isFilter('deleted_at', null)
      .limit(1);
  if (mine.isEmpty) {
    await client.from('wishes').insert({
      'couple_id': coupleId,
      'place_id': placeId,
      'user_id': uid,
      'created_by': uid,
      'updated_by': uid,
    });
  }

  return (placeId: placeId, jumped: jumped);
}
