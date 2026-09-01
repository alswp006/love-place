/// 우리 탭 — 연결 · 해제 · 로그아웃.
///
/// ## 왜 이 화면이 먼저였나
///
/// Flutter판에는 커플 연결이 없었다. 0024의 `ensure_solo_couple`이 모든 로그인에 '혼자짜리
/// 커플'을 만들어 주므로 앱은 죽지 않지만, 둘이 설치하면 **각자 다른 공간을 본다** —
/// 같이 쓰는 앱인데 같이 못 쓴다. 로그아웃도 없어서 계정을 바꿀 수도 없었다.
///
/// ## 연결의 방향이 중요하다
///
/// 코드를 **주는 쪽**이 아니라 **넣는 쪽**의 데이터가 남는다(0024). 둘 다 혼자 쓰며 데이터를
/// 쌓았다면 서버가 `HAS_OWN_DATA`로 거절하는데, 그 문구가 "반대로 상대에게 코드를 받아
/// 연결해 주세요"인 이유가 이것이다. 화면에서도 그 방향을 미리 설명한다 —
/// 눌러보고 거절당한 뒤 이해하는 것보다 낫다.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/supabase.dart';
import '../state/auth.dart';
import '../state/couple.dart';
import '../state/couple_actions.dart';
import 'invite_code.dart';

class UsScreen extends ConsumerStatefulWidget {
  const UsScreen({super.key});

  @override
  ConsumerState<UsScreen> createState() => _UsScreenState();
}

class _UsScreenState extends ConsumerState<UsScreen> {
  final _code = TextEditingController();
  String? _myInvite;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _say(String? msg) {
    if (msg == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _run(Future<CoupleRpcResult> Function() op,
      {String? okMessage}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final r = await op();
      if (!mounted) return;
      _say(r.ok ? okMessage : r.message);
    } catch (e) {
      _say('문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createInvite() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(coupleActionsProvider).createInvite();
      if (!mounted) return;
      if (r.ok && r.code != null) {
        setState(() => _myInvite = r.code);
      } else {
        _say(r.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDisconnect(String coupleId) async {
    // 되돌리기 어려운 동작이라 반드시 한 번 묻는다. 무엇이 일어나는지도 함께 말한다.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('연결을 해제할까요?'),
        content: const Text(
          '해제하면 각자 혼자 쓰는 공간으로 돌아가요. '
          '지금까지 함께 담은 장소·일정은 한쪽에 남습니다.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('해제',
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(() => ref.read(coupleActionsProvider).disconnect(coupleId),
        okMessage: '연결을 해제했어요.');
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final couple = ref.watch(coupleProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('우리')),
      body: couple.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (info) => ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _Section(
              title: '계정',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.person_outline),
                  title: Text(user?.email ?? '(이메일 없음)'),
                  subtitle: const Text('로그인 계정'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => db.auth.signOut(),
                  child: const Text('로그아웃'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (info.isSolo || !info.isActive)
              _ConnectSection(
                busy: _busy,
                code: _code,
                myInvite: _myInvite,
                onCreate: _createInvite,
                onAccept: () async {
                  if (!isValidInviteCode(_code.text)) {
                    _say('코드는 8자예요. 다시 확인해 주세요.');
                    return;
                  }
                  await _run(
                    () => ref
                        .read(coupleActionsProvider)
                        .acceptInvite(_code.text),
                    okMessage: '연결됐어요! 이제 같은 공간을 함께 써요.',
                  );
                },
              )
            else
              _Section(
                title: '연결',
                children: [
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.favorite_outline),
                    title: Text('연결됨'),
                    subtitle: Text('장소·일정을 함께 보고 있어요.'),
                  ),
                  TextButton(
                    onPressed: _busy || info.coupleId == null
                        ? null
                        : () => _confirmDisconnect(info.coupleId!),
                    child: Text('연결 해제',
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _ConnectSection extends StatelessWidget {
  const _ConnectSection({
    required this.busy,
    required this.code,
    required this.myInvite,
    required this.onCreate,
    required this.onAccept,
  });

  final bool busy;
  final TextEditingController code;
  final String? myInvite;
  final VoidCallback onCreate;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Section(
      title: '상대와 연결',
      children: [
        Text(
          '한 명이 코드를 만들고, 다른 한 명이 그 코드를 넣으면 연결돼요.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 4),
        // 방향을 미리 말한다 — 눌러보고 HAS_OWN_DATA로 거절당한 뒤 이해하는 것보다 낫다.
        Text(
          '이미 각자 담아둔 게 있다면, 기록이 많은 쪽이 코드를 만들어 주세요.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        if (myInvite == null)
          OutlinedButton.icon(
            onPressed: busy ? null : onCreate,
            icon: const Icon(Icons.qr_code),
            label: const Text('내 초대 코드 만들기'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48), // 터치 타깃(HIG)
            ),
          )
        else
          _InviteCard(code: myInvite!),
        const SizedBox(height: 20),
        TextField(
          controller: code,
          enabled: !busy,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: '받은 코드 입력',
            hintText: 'ABCD-2345',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: busy ? null : onAccept,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
          child: const Text('연결하기'),
        ),
      ],
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // 손으로 옮겨 적거나 불러줄 값이라 크게, 4-4로 끊어서.
            SelectableText(
              formatInviteCode(code),
              style: theme.textTheme.headlineSmall
                  ?.copyWith(letterSpacing: 4, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text('48시간 안에 상대가 입력해야 해요',
                style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: inviteShareText(code)));
                ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('안내 문구를 복사했어요')));
              },
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('복사해서 보내기'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ],
      );
}
