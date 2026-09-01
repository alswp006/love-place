/// 일정 만들기·고치기 시트.
///
/// 웹판 `EventSheet.tsx`(438줄)의 이식이지만 **절반쯤 짧다**. 포커스 트랩·ESC·스크롤락·포탈·
/// 스와이프 다운(웹판에서 ≈70줄)을 Flutter의 `showModalBottomSheet`가 기본으로 준다.
///
/// ## 이 시트가 지키는 계약
///
/// · 시각 검증은 [buildEventTimes]가 한다 — DB의 CHECK는 백스톱일 뿐이다.
/// · 저장 실패·충돌에도 **입력을 보존**하고 인라인으로 알린다(ux §7). 닫아버리면 사용자가
///   방금 쓴 내용을 잃는다.
/// · 리마인더는 [mergeMyReminder]로 **상대 것을 보존**한 채 내 것만 갈아끼운다.
/// · 상대의 PERSONAL 일정은 읽기 전용이다 — 저장을 눌러도 RLS가 0행으로 막는 걸 미리 막는다.
///
/// ## P1 범위
///
/// 반복 **편집**은 여기 없다(P2). 반복 일정을 열면 읽기 전용으로 두고 그 이유를 말한다 —
/// 회차 하나를 고치는 게 시리즈 전체를 고치는 것처럼 보이면 그게 제일 나쁘다.
library;

import 'package:flutter/material.dart';

import 'event_mutations.dart';
import 'event_row.dart';
import 'event_times.dart';
import 'track.dart';
import 'tz.dart';

/// 시트가 돌려주는 사용자 의도. null이면 취소.
sealed class EventSheetResult {
  const EventSheetResult();
}

class EventSheetSave extends EventSheetResult {
  const EventSheetSave(this.event);
  final NewEvent event;
}

class EventSheetPatch extends EventSheetResult {
  const EventSheetPatch(this.patch);
  final EventPatch patch;
}

class EventSheetDelete extends EventSheetResult {
  const EventSheetDelete();
}

Future<EventSheetResult?> showEventSheet(
  BuildContext context, {
  required String dayKeyStr,
  required String? myId,
  EventRow? existing,
}) =>
    showModalBottomSheet<EventSheetResult>(
      context: context,
      isScrollControlled: true, // 키보드가 올라와도 입력이 가리지 않게
      useSafeArea: true,
      builder: (_) => _EventSheet(
        dayKeyStr: dayKeyStr,
        myId: myId,
        existing: existing,
      ),
    );

class _EventSheet extends StatefulWidget {
  const _EventSheet({
    required this.dayKeyStr,
    required this.myId,
    this.existing,
  });

  final String dayKeyStr;
  final String? myId;
  final EventRow? existing;

  @override
  State<_EventSheet> createState() => _EventSheetState();
}

class _EventSheetState extends State<_EventSheet> {
  late final _title = TextEditingController(text: widget.existing?.title ?? '');
  late String _date =
      widget.existing != null ? dayKey(widget.existing!.startAt) : widget.dayKeyStr;
  late bool _allDay = widget.existing?.isAllDay ?? false;
  late String _startTime =
      widget.existing != null ? formatTime(widget.existing!.startAt) : '10:00';
  late String _endTime =
      widget.existing != null ? formatTime(widget.existing!.endAt) : '11:00';
  late bool _shared = widget.existing?.isShared ?? true;
  String? _error;

  /// 반복 시리즈인가 — 저장·삭제 시 범위를 물어야 한다(어느 회차까지 바꿀지).
  bool get _isRecurring => widget.existing?.recurrenceRule != null;

  /// 상대의 PERSONAL 일정 — RLS가 막는다. 눌러보고 실패하게 두지 않는다.
  bool get _isOthersPersonal {
    final e = widget.existing;
    if (e == null) return false;
    return !e.isShared && e.ownerId != widget.myId;
  }

  bool get _readOnly => _isOthersPersonal;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _save() {
    final title = _title.text.trim();
    if (title.isEmpty) {
      setState(() => _error = '제목을 입력해주세요.');
      return;
    }
    final t = buildEventTimes(
      date: _date,
      allDay: _allDay,
      startTime: _allDay ? null : _startTime,
      endTime: _allDay ? null : _endTime,
    );
    if (t is EventTimesRejected) {
      setState(() => _error = switch (t.reason) {
            EventTimesReason.same => '시작과 종료가 같아요. 종료를 뒤로 옮겨주세요.',
            EventTimesReason.range => '종료가 시작보다 앞이에요.',
            EventTimesReason.missing => '날짜와 시각을 확인해주세요.',
          });
      return;
    }
    final ok = t as EventTimesOk;
    final visibility =
        _shared ? EventVisibility.shared : EventVisibility.personal;

    final existing = widget.existing;
    if (existing == null) {
      Navigator.pop(
        context,
        EventSheetSave(NewEvent(
          title: title,
          start: ok.start,
          end: ok.end,
          isAllDay: _allDay,
          visibility: visibility,
        )),
      );
      return;
    }
    // 바뀐 것만 담는다 — 특히 place_id는 넣지 않아 서버 값(코스 연결)을 보존한다.
    final patch = EventPatch();
    if (title != existing.title) patch.title(title);
    if (ok.start != existing.startAt || ok.end != existing.endAt) {
      patch.times(ok.start, ok.end);
    }
    if (_allDay != existing.isAllDay) patch.isAllDay(_allDay);
    if (visibility != existing.visibility) patch.visibility(visibility);
    Navigator.pop(context, EventSheetPatch(patch));
  }

  Future<void> _pickDate() async {
    final cur = startOfDay(_date);
    final picked = await showDatePicker(
      context: context,
      initialDate: toDisplay(cur),
      firstDate: DateTime.utc(2000),
      lastDate: DateTime.utc(2100),
    );
    if (picked == null) return;
    setState(() => _date =
        '${picked.year.toString().padLeft(4, '0')}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}');
  }

  Future<void> _pickTime(bool isStart) async {
    final cur = (isStart ? _startTime : _endTime).split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime:
          TimeOfDay(hour: int.parse(cur[0]), minute: int.parse(cur[1])),
    );
    if (picked == null) return;
    final v = '${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}';
    setState(() {
      if (isStart) {
        _startTime = v;
      } else {
        _endTime = v;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      // 키보드 높이만큼 밀어 올린다 — 안 하면 입력창이 키보드에 가린다.
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_readOnly) const _ReadOnlyNote(),
            if (_isRecurring && !_readOnly) const _RecurringNote(),
            TextField(
              controller: _title,
              enabled: !_readOnly,
              autofocus: widget.existing == null,
              decoration: const InputDecoration(
                labelText: '제목',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('날짜'),
              trailing: Text(_date),
              onTap: _readOnly ? null : _pickDate,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('종일'),
              value: _allDay,
              onChanged:
                  _readOnly ? null : (v) => setState(() => _allDay = v),
            ),
            if (!_allDay) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('시작'),
                trailing: Text(_startTime),
                onTap: _readOnly ? null : () => _pickTime(true),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('종료'),
                trailing: Text(_endTime),
                onTap: _readOnly ? null : () => _pickTime(false),
              ),
            ],
            const SizedBox(height: 8),
            // 트랙은 색이 아니라 글자로 고른다 — 색만으로 말하지 않는다(§8).
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('함께')),
                ButtonSegment(value: false, label: Text('나만')),
              ],
              selected: {_shared},
              onSelectionChanged: _readOnly
                  ? null
                  : (s) => setState(() => _shared = s.first),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              // 인라인 에러 — 시트를 닫지 않는다(입력 보존, ux §7).
              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ],
            const SizedBox(height: 20),
            if (!_readOnly)
              FilledButton(
                onPressed: _save,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48), // 터치 타깃(HIG)
                ),
                child: Text(widget.existing == null ? '만들기' : '저장'),
              ),
            if (widget.existing != null) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    Navigator.pop(context, const EventSheetDelete()),
                child: Text('삭제',
                    style: TextStyle(color: theme.colorScheme.error)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReadOnlyNote extends StatelessWidget {
  const _ReadOnlyNote();

  @override
  Widget build(BuildContext context) => _Note(
        icon: Icons.lock_outline,
        text: '상대의 개인 일정이라 볼 수만 있어요.',
      );
}

/// 반복 일정임을 **저장 전에** 알린다. 저장을 누른 뒤에야 범위를 묻는 것보다,
/// 고치는 동안 "이건 반복이다"를 알고 있는 편이 덜 놀란다.
class _RecurringNote extends StatelessWidget {
  const _RecurringNote();

  @override
  Widget build(BuildContext context) => const _Note(
        icon: Icons.repeat,
        text: '반복 일정이에요. 저장할 때 어디까지 바꿀지 물어볼게요.',
      );
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Icon(icon, size: 16),
            const SizedBox(width: 6),
            Expanded(
              child: Text(text,
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          ],
        ),
      );
}
