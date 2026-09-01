import 'package:flutter_test/flutter_test.dart';

import 'package:weave/calendar/event_mutations.dart';
import 'package:weave/calendar/event_row.dart';

void main() {
  group('mergeMyReminder — 상대 리마인더 보존', () {
    // 여기가 이 파일에서 가장 조용히 틀리기 쉬운 자리다. reminders는 jsonb 배열 하나라
    // 행을 고칠 수 있으면 배열 전체를 덮어쓸 수 있고, DB·RLS 어느 것도 사용자별 분리를
    // 강제하지 않는다. 이 함수를 안 거치면 내가 일정을 고치는 순간 상대 리마인더가 사라진다.
    const mine = Reminder(userId: 'me', offsetMinutes: 10);
    const theirs = Reminder(userId: 'you', offsetMinutes: 30);

    List<String> keys(List<Reminder> rs) =>
        rs.map((r) => '${r.userId}:${r.offsetMinutes}').toList()..sort();

    test('★ 내 것을 바꿔도 상대 것은 그대로 남는다', () {
      final out = mergeMyReminder([mine, theirs], 'me', 60);
      expect(keys(out), ['me:60', 'you:30']);
    });

    test('내 리마인더를 지워도 상대 것은 남는다', () {
      expect(keys(mergeMyReminder([mine, theirs], 'me', null)), ['you:30']);
    });

    test('0분은 "없음"이다(웹판과 같은 해석)', () {
      expect(keys(mergeMyReminder([mine, theirs], 'me', 0)), ['you:30']);
    });

    test('내 것이 없던 상태에서 추가', () {
      expect(keys(mergeMyReminder([theirs], 'me', 15)), ['me:15', 'you:30']);
    });

    test('중복이 쌓이지 않는다 — 내 항목은 언제나 하나', () {
      final twice = [mine, mine, theirs];
      final out = mergeMyReminder(twice, 'me', 5);
      expect(out.where((r) => r.userId == 'me').length, 1);
    });
  });

  group('NewEvent.toInsert', () {
    final e = NewEvent(
      title: '속초 카페',
      start: DateTime.utc(2026, 6, 2, 1, 0),
      end: DateTime.utc(2026, 6, 2, 2, 0),
      isAllDay: false,
      visibility: 'SHARED',
    );

    test('서버가 요구하는 필수 컬럼을 모두 채운다', () {
      final row = e.toInsert(coupleId: 'c1', myId: 'u1');
      // RLS가 owner_id = auth.uid()를 강제한다. created_by는 검사하지 않지만 규약으로 맞춘다.
      for (final k in [
        'couple_id', 'title', 'start', 'end', 'is_all_day', 'time_zone',
        'visibility', 'owner_id', 'created_by', 'updated_by',
      ]) {
        expect(row.containsKey(k), isTrue, reason: '$k 누락');
      }
      expect(row['owner_id'], 'u1');
      expect(row['created_by'], 'u1');
    });

    test("JSON 키는 'start'/'end' — SQL 예약어라도 와이어에서는 맨몸이다", () {
      final row = e.toInsert(coupleId: 'c1', myId: 'u1');
      expect(row['start'], '2026-06-02T01:00:00.000Z');
      expect(row['end'], '2026-06-02T02:00:00.000Z');
    });

    test("participants는 'BOTH' — 웹판이 모든 쓰기에 박는 값이라 맞춘다", () {
      expect(e.toInsert(coupleId: 'c1', myId: 'u1')['participants'], 'BOTH');
    });

    test('★ category_id를 흘리지 않는다 — 웹판 오프라인 재생의 버그를 따라 옮기지 않았다', () {
      final withCat = NewEvent(
        title: 'x',
        start: e.start,
        end: e.end,
        isAllDay: false,
        visibility: 'SHARED',
        categoryId: 'cat-1',
      );
      expect(withCat.toInsert(coupleId: 'c1', myId: 'u1')['category_id'], 'cat-1');
      // 큐 페이로드도 같은 본문이어야 재생 결과가 온라인 경로와 일치한다.
      final q = withCat.toQueuePayload(coupleId: 'c1', myId: 'u1');
      expect((q['row'] as Map)['category_id'], 'cat-1');
    });

    test('dedupeKey는 시작시각+제목 — 같은 일정을 두 번 눌러도 한 건만 큐에 남는다', () {
      final again = NewEvent(
        title: e.title, start: e.start, end: e.end,
        isAllDay: false, visibility: 'PERSONAL', // 다른 필드가 달라도
      );
      expect(again.dedupeKey(), e.dedupeKey());
    });
  });

  group('EventPatch — 넣은 키만 나간다', () {
    test('빈 패치는 비어 있다(서버를 부르지 않게)', () {
      expect(EventPatch().isEmpty, isTrue);
    });

    test('★ 건드리지 않은 place_id는 패치에 없다 — 코스 연결이 날아가면 안 된다', () {
      final p = EventPatch()..title('새 제목');
      expect(p.map.containsKey('place_id'), isFalse);
      expect(p.map, {'title': '새 제목'});
    });

    test('null과 생략은 다르다 — null은 "지운다"는 뜻이다', () {
      final p = EventPatch()..categoryId(null);
      expect(p.map.containsKey('category_id'), isTrue);
      expect(p.map['category_id'], isNull);
    });

    test('times는 start/end를 함께 넣는다(둘 중 하나만 바뀌면 CHECK가 터진다)', () {
      final p = EventPatch()
        ..times(DateTime.utc(2026, 6, 2, 1), DateTime.utc(2026, 6, 2, 2));
      expect(p.map.keys.toSet(), {'start', 'end'});
    });
  });
}
