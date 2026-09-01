/// 반복 범위 선택 — "어디까지 바꿀까요?"
///
/// ## 왜 이 물음이 필요한가
///
/// 반복 일정에서 회차 하나를 고칠 때, 사용자의 의도는 셋 중 하나다. 물어보지 않고 하나를
/// 고르면 나머지 둘은 **조용히 틀린 결과**가 된다 — 특히 '전체'를 기본으로 삼으면
/// "하나만 고쳤는데 다 바뀌었다"가 되고, 그건 되돌리기도 어렵다.
///
/// ## 문구를 날짜로 말한다
///
/// '이 일정만' 같은 추상어 대신 그 회차 날짜를 넣는다. 어느 회차를 고르고 있었는지
/// 시트를 거치는 동안 잊기 쉽다.
library;

import 'package:flutter/material.dart';

import 'recurrence_scope.dart';

/// [occDayKey]는 'YYYY-MM-DD'. [deleting]이면 문구가 삭제형으로 바뀐다.
Future<RecurrenceScope?> askRecurrenceScope(
  BuildContext context, {
  required String occDayKey,
  bool deleting = false,
}) {
  final md = occDayKey.split('-');
  final day = '${int.parse(md[1])}월 ${int.parse(md[2])}일';
  final verb = deleting ? '삭제' : '변경';

  return showDialog<RecurrenceScope>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('반복 일정 $verb'),
      content: Text('어디까지 $verb할까요?'),
      actions: [
        // 파괴적인 정도가 낮은 것부터 위에 둔다 — 목록의 첫 항목이 가장 많이 눌린다.
        TextButton(
          onPressed: () => Navigator.pop(ctx, RecurrenceScope.thisOne),
          child: Text('$day만'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, RecurrenceScope.following),
          child: Text('$day부터 이후 전부'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, RecurrenceScope.all),
          child: const Text('전체 반복'),
        ),
        // 취소가 마지막 — 실수로 첫 버튼을 누르는 사고를 줄인다.
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('취소'),
        ),
      ],
    ),
  );
}
