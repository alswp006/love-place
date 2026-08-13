/// 장소 검색 컨트롤러 — 웹판 `useKakaoSearch`의 이식.
///
/// - 디바운스 250ms(타이핑 멈춘 뒤 호출).
/// - **순번(seq) 가드로 stale 응답 폐기** — 웹판과 동일: functions.invoke는
///   취소를 받지 않으므로, 늦게 도착한 옛 응답은 버린다(race 방지).
/// - 검색 제공자: Edge Function `naver-search`(프록시 — 키는 서버에만, §10.1).
///   카카오 롤백 시 'kakao-search'로.
/// - 프록시의 구조화 에러 메시지(403=미연결, 429=한도)를 그대로 노출.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import 'place_hit.dart';

enum SearchStatus { idle, loading, done, error }

const searchDebounce = Duration(milliseconds: 250);

class PlaceSearchController extends ChangeNotifier {
  PlaceSearchController({Future<List<PlaceHit>> Function(String query)? fetch})
      : _fetch = fetch ?? _invokeProxy;

  final Future<List<PlaceHit>> Function(String query) _fetch;

  SearchStatus status = SearchStatus.idle;
  List<PlaceHit> hits = const [];
  String? error;
  String _query = '';
  Timer? _debounce;
  int _seq = 0;

  String get query => _query;

  void setQuery(String q) {
    _query = q;
    _debounce?.cancel();
    _debounce = Timer(searchDebounce, () => _run(q));
    notifyListeners();
  }

  void clear() {
    _debounce?.cancel();
    _seq++; // 비행 중 응답도 무효화
    _query = '';
    status = SearchStatus.idle;
    hits = const [];
    error = null;
    notifyListeners();
  }

  Future<void> _run(String q) async {
    final trimmed = q.trim();
    if (trimmed.isEmpty) {
      status = SearchStatus.idle;
      hits = const [];
      error = null;
      notifyListeners();
      return;
    }
    final mySeq = ++_seq;
    status = SearchStatus.loading;
    error = null;
    notifyListeners();
    try {
      final result = await _fetch(trimmed);
      if (mySeq != _seq) return; // stale — 최신 순번만 반영
      status = SearchStatus.done;
      hits = result;
    } catch (e) {
      if (mySeq != _seq) return;
      status = SearchStatus.error;
      hits = const [];
      error = e is _ProxyError ? e.message : '검색에 실패했어요. 다시 시도해주세요.';
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}

class _ProxyError implements Exception {
  const _ProxyError(this.message);
  final String message;
}

Future<List<PlaceHit>> _invokeProxy(String query) async {
  // 설정 게이트는 실제 프록시 호출 경로에만 — 주입 fetch(테스트)는 설정과 무관하다.
  if (!Env.supabaseConfigured) {
    throw const _ProxyError('서버 연결 전이에요. (개발 중)');
  }
  try {
    final res = await db.functions
        .invoke('naver-search', body: {'query': query});
    final data = res.data;
    if (data is! Map || data['ok'] != true || data['hits'] is! List) {
      throw const _ProxyError('검색 응답이 올바르지 않아요.');
    }
    return (data['hits'] as List)
        .whereType<Map<String, dynamic>>()
        .map(PlaceHit.fromJson)
        .toList();
  } on FunctionException catch (e) {
    // 프록시의 구조화 메시지(진짜 원인)를 꺼낸다 — 403=미연결, 429=한도 등.
    final details = e.details;
    if (details is Map && details['message'] is String) {
      throw _ProxyError(details['message'] as String);
    }
    throw const _ProxyError('검색에 실패했어요. 다시 시도해주세요.');
  }
}
