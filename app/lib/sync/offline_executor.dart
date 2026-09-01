/// 아웃박스 항목 → 실제 Supabase op — 웹판 `state/offlineExecutor.ts`의 이식.
///
/// 반환: ok(적용) | conflict(서버가 더 최신 — 제거+보고).
/// **네트워크 오류는 throw** → 큐가 잔류시키고 재시도한다(유실 0).
///
/// 슬라이스 범위: 'place.save'만. 위시 하트·휴지통·이벤트 op은 해당 mutation이
/// 이식될 때 여기 case로 추가된다(웹판 OutboxKind 레지스트리와 1:1 유지).
library;

import 'package:supabase_flutter/supabase_flutter.dart';

import '../places/save_place.dart';
import '../search/place_hit.dart';
import 'offline_queue.dart';
import 'outbox_store.dart';
import 'versioned_update.dart';

Future<FlushOutcome> executeOutbox(
  SupabaseClient client,
  OutboxEntry entry,
) async {
  switch (entry.kind) {
    case 'place.save':
      final p = entry.payload;
      // 중복은 savePlace의 dedup(합성키+좌표창)이 흡수 — 재생 안전(멱등).
      await savePlace(
        client,
        p['coupleId'] as String,
        PlaceHit.fromJson((p['hit'] as Map).cast<String, dynamic>()),
        p['uid'] as String,
      );
      return FlushOutcome.ok;
    case 'wish.setPriority':
      final p = entry.payload;
      // 큐에 담을 때의 version으로 재생 — 그 사이 상대가 고쳤으면 conflict로
      // 보고된다(LWW 금지). 오프라인 중 재편집은 dedupeKey가 최신 의도만 남겼다.
      final r = await versionedUpdate(
        client,
        'wishes',
        p['wishId'] as String,
        p['expectedVersion'] as int,
        {'priority': p['priority'], 'updated_by': p['myId']},
      );
      return r is VersionedOk ? FlushOutcome.ok : FlushOutcome.conflict;
    case 'event.create':
      // 큐에 담을 때 완성된 insert 본문을 그대로 재생한다 — 재계산하면 그 사이 바뀐
      // 로컬 상태(선택한 날짜 등)가 섞여 다른 행이 만들어진다.
      // 멱등성은 dedupeKey(시작시각+제목)가 큐 단계에서 보장한다.
      await client
          .from('events')
          .insert((entry.payload['row'] as Map).cast<String, dynamic>());
      return FlushOutcome.ok;
    case 'event.update':
      final p = entry.payload;
      final r = await versionedUpdate(
        client,
        'events',
        p['id'] as String,
        p['expectedVersion'] as int,
        {
          ...(p['patch'] as Map).cast<String, dynamic>(),
          'updated_by': p['myId'],
        },
      );
      return r is VersionedOk ? FlushOutcome.ok : FlushOutcome.conflict;
    case 'event.delete':
      final p = entry.payload;
      final r = await softDelete(
        client,
        'events',
        p['id'] as String,
        p['expectedVersion'] as int,
        p['myId'] as String,
      );
      return r is VersionedOk ? FlushOutcome.ok : FlushOutcome.conflict;
    default:
      // 진짜 미지의 종류 — 무시+제거(웹판 default와 동일). throw로 잔류시키면
      // poison 엔트리 하나가 뒤의 모든 큐를 영구 차단한다(head-of-line blocking) —
      // 웹판이 이 트레이드오프에서 제거를 택했고, 여기서도 따른다.
      return FlushOutcome.ok;
  }
}

/// PlaceHit → outbox payload(JSON 직렬화 가능 형태).
Map<String, dynamic> placeSavePayload({
  required String coupleId,
  required PlaceHit hit,
  required String uid,
}) =>
    {
      'coupleId': coupleId,
      'uid': uid,
      'hit': {
        'kakaoPlaceId': hit.kakaoPlaceId,
        'name': hit.name,
        'address': hit.address,
        'lat': hit.lat,
        'lng': hit.lng,
        'category': hit.category,
        if (hit.placeUrl != null) 'placeUrl': hit.placeUrl,
        if (hit.phone != null) 'phone': hit.phone,
      },
    };
