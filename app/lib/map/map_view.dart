/// 지도 뷰 — 웹판 `NaverMap.tsx`(583줄, ref 20개)의 대체.
///
/// 세 가지 병리 고침이 여기서 합류한다:
/// - **C1**: [bottomOcclusionPx]를 SDK `contentPadding`으로 넘긴다 → 카메라 이동·
///   fitBounds·로고 위치가 가려지지 않은 영역 기준으로 전부 자동. 핀이 시트 뒤로
///   숨지 않는다.
/// - **C2**: 초기 센터링은 [CameraPolicy] 상태기계가 결정한다(불리언 3개 조합 폐지).
/// - **B2**: 마커는 [diffMarkers] 변경분만 적용한다(전체 파괴/재생성 폐지 —
///   선택 강조 깜빡임이 구조적으로 불가능).
///
/// 데이터는 위에서 내려온다(이 위젯은 fetch하지 않는다) — 웹판과 동일한 분리.
library;

import 'package:flutter/material.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';

import '../core/env.dart';
import '../geo/locator.dart';
import 'camera_policy.dart';
import 'cluster.dart';
import 'marker_diff.dart';
import 'marker_icon.dart';

/// 마커에 필요한 최소 데이터(도출 완료 상태로 받는다 — 상태는 저장 아님 §7).
class MapPlace {
  const MapPlace({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    this.visited = false,
    this.bothWished = false,
  });
  final String id;
  final String name;
  final double lat;
  final double lng;
  final bool visited;
  final bool bothWished;
}

class MapView extends StatefulWidget {
  const MapView({
    super.key,
    required this.places,
    this.selectedId,
    this.onSelect,
    this.onMapTap,
    this.bottomOcclusionPx = 0,
    this.orderById,
    this.polyline,
    this.locator = const GeolocatorLocator(),
  });

  final List<MapPlace> places;
  final String? selectedId;
  final ValueChanged<String>? onSelect;

  /// 지도 빈 곳 탭 → 선택 해제(웹판 map click과 동일).
  final VoidCallback? onMapTap;

  /// 시트가 가리는 높이(px). 부모(MapScreen)가 `sheetOcclusionPx()`로 계산해 내린다.
  final double bottomOcclusionPx;

  /// 여행 Day 스톱 순번(placeId → 1-based).
  final Map<String, int>? orderById;

  /// 리캡 동선 폴리라인(정점 순서).
  final List<({double lat, double lng})>? polyline;

  final Locator locator;

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> {
  NaverMapController? _controller;
  final _policy = CameraPolicy();

  /// 현재 지도에 올라간 마커(key → spec/NMarker). diff의 "current" 쪽.
  final _current = <String, MarkerSpec>{};
  final _markers = <String, NMarker>{};

  /// 아이콘 이미지 캐시 — 변형당 1회만 렌더(SDK 권고: 객체 재사용).
  final _iconCache = <MarkerIconKey, NOverlayImage>{};
  Brightness? _iconBrightness;

  double _zoom = 11; // 웹판 초기 줌과 동일
  bool _rendering = false;
  bool _renderQueued = false;
  bool _locating = false;
  String? _toast;

  static const _defaultCenter = NLatLng(37.5665, 126.978); // 서울시청(빈 상태)

  @override
  void didUpdateWidget(covariant MapView old) {
    super.didUpdateWidget(old);
    if (!identical(old.places, widget.places)) {
      _applyCamera(_policy.onPlacesLoaded(hasPlaces: _coordPlaces.isNotEmpty));
    }
    if (!identical(old.places, widget.places) ||
        old.selectedId != widget.selectedId ||
        !identical(old.orderById, widget.orderById)) {
      _requestRender();
    }
    if (old.polyline != widget.polyline) _syncPolyline();
  }

  List<MapPlace> get _coordPlaces => widget.places;

  // ---- 카메라 ----

  Future<void> _applyCamera(CameraAction action) async {
    final c = _controller;
    if (c == null) return;
    switch (action) {
      case CameraNoop():
        return;
      case CameraMoveTo(:final lat, :final lng, :final zoom):
        await c.updateCamera(
          NCameraUpdate.scrollAndZoomTo(target: NLatLng(lat, lng), zoom: zoom)
            ..setAnimation(
                animation: NCameraAnimation.easing,
                duration: const Duration(milliseconds: 400)),
        );
      case CameraFitPlaces():
        final pts = _coordPlaces
            .map((p) => NLatLng(p.lat, p.lng))
            .toList(growable: false);
        if (pts.isEmpty) return;
        if (pts.length == 1) {
          await c.updateCamera(
              NCameraUpdate.scrollAndZoomTo(target: pts.first, zoom: locateZoom));
          return;
        }
        await c.updateCamera(NCameraUpdate.fitBounds(
          NLatLngBounds.from(pts),
          padding: const EdgeInsets.all(48),
        ));
    }
  }

  Future<void> _onMapReady(NaverMapController c) async {
    _controller = c;
    _requestRender();
    _syncPolyline();
    // 자동 locate는 이미 granted일 때만(추가 프롬프트 금지, spec §3.5).
    if (await widget.locator.isGranted()) {
      final r = await widget.locator.current();
      if (!mounted) return;
      switch (r) {
        case GeoOk(:final lat, :final lng):
          await _applyCamera(_policy.onGeoResolved(lat, lng));
        case GeoFail():
          await _applyCamera(
              _policy.onGeoFailed(hasPlaces: _coordPlaces.isNotEmpty));
      }
    } else {
      await _applyCamera(
          _policy.onGeoFailed(hasPlaces: _coordPlaces.isNotEmpty));
    }
  }

  Future<void> _locate() async {
    if (_locating) return;
    setState(() => _locating = true);
    // 맥락 요청 — 버튼을 눌렀을 때만 권한 프롬프트(security §3.1).
    final r = await widget.locator.current(requestIfNeeded: true);
    if (!mounted) return;
    setState(() => _locating = false);
    switch (r) {
      case GeoOk(:final lat, :final lng):
        await _applyCamera(_policy.onLocatePressed(lat, lng));
      case GeoFail(:final reason):
        setState(() => _toast = switch (reason) {
              GeoFailReason.denied => locationPermissionDeniedMsg,
              _ => locationServicesOffMsg,
            });
    }
  }

  // ---- 마커 (B2: diff만 적용) ----

  void _requestRender() {
    if (_rendering) {
      _renderQueued = true; // 렌더 중 재요청 — 끝나고 한 번 더(최신 상태로).
      return;
    }
    _render();
  }

  Future<void> _render() async {
    final c = _controller;
    if (c == null || !mounted) return;
    _rendering = true;
    try {
      final brightness = MediaQuery.platformBrightnessOf(context);
      if (_iconBrightness != brightness) {
        // 다크모드 전환 — 아이콘 캐시 무효화 + 전 마커 재아이콘(스펙 diff 밖의 축).
        _iconCache.clear();
        _iconBrightness = brightness;
        _current.clear(); // 전부 update로 잡히게
      }

      final pts = _coordPlaces
          .map((p) => ClusterPoint(id: p.id, lat: p.lat, lng: p.lng))
          .toList(growable: false);
      final specs = buildMarkerSpecs(
        groups: clusterPlaces(pts, _zoom),
        places: {
          for (final p in _coordPlaces)
            p.id: (name: p.name, visited: p.visited, bothWished: p.bothWished),
        },
        selectedId: widget.selectedId,
        orderById: widget.orderById,
      );
      final diff = diffMarkers(_current, specs);
      if (diff.isEmpty) return;

      for (final key in diff.remove) {
        await c.deleteOverlay(
            NOverlayInfo(type: NOverlayType.marker, id: key));
        _current.remove(key);
        _markers.remove(key);
      }

      final additions = <NMarker>{};
      for (final spec in diff.add) {
        final marker = NMarker(
          id: spec.key,
          position: NLatLng(spec.lat, spec.lng),
          icon: await _iconFor(spec, brightness),
        );
        _wireTap(marker, spec);
        additions.add(marker);
        _markers[spec.key] = marker;
        _current[spec.key] = spec;
      }
      if (additions.isNotEmpty) await c.addOverlayAll(additions);
      for (final spec in diff.add) {
        _markers[spec.key]?.setZIndex(spec.zIndex);
      }

      for (final spec in diff.update) {
        final marker = _markers[spec.key];
        if (marker == null) continue;
        marker
          ..setPosition(NLatLng(spec.lat, spec.lng))
          ..setIcon(await _iconFor(spec, brightness))
          ..setZIndex(spec.zIndex);
        _wireTap(marker, spec); // 클러스터 멤버가 변했으면 줌인 대상도 갱신
        _current[spec.key] = spec;
      }
    } finally {
      _rendering = false;
      if (_renderQueued) {
        _renderQueued = false;
        _requestRender();
      }
    }
  }

  void _wireTap(NMarker marker, MarkerSpec spec) {
    if (spec.isCluster) {
      final ids = spec.key.substring(2).split(',');
      marker.setOnTapListener((_) => _onClusterTap(ids, spec));
    } else {
      marker.setOnTapListener((_) => widget.onSelect?.call(spec.key));
    }
  }

  Future<void> _onClusterTap(List<String> ids, MarkerSpec spec) async {
    final c = _controller;
    if (c == null) return;
    final pts = _coordPlaces
        .map((p) => ClusterPoint(id: p.id, lat: p.lat, lng: p.lng))
        .toList(growable: false);
    final members = clusterMemberPts(ids, pts);
    // degenerate(근접 좌표)면 fitBounds 과확대 대신 +3 줌인 — 웹판과 동일 분기.
    if (members.isEmpty || boundsSpanTiny(members)) {
      await c.updateCamera(NCameraUpdate.scrollAndZoomTo(
        target: NLatLng(spec.lat, spec.lng),
        zoom: (_zoom + 3).clamp(0, 19),
      ));
      return;
    }
    await c.updateCamera(NCameraUpdate.fitBounds(
      NLatLngBounds.from(
          members.map((p) => NLatLng(p.lat, p.lng)).toList(growable: false)),
      padding: const EdgeInsets.all(48),
    ));
  }

  Future<NOverlayImage> _iconFor(MarkerSpec spec, Brightness brightness) async {
    final key = iconKeyOf(spec, brightness);
    final cached = _iconCache[key];
    if (cached != null) return cached;
    final image = await NOverlayImage.fromWidget(
      widget: spec.isCluster
          ? ClusterIcon(count: spec.clusterCount!, brightness: brightness)
          : PinIcon(spec: spec, brightness: brightness),
      size: spec.isCluster ? clusterSize : pinSize,
      // ignore: use_build_context_synchronously — fromWidget은 오프스크린 렌더에만 사용
      context: context,
    );
    _iconCache[key] = image;
    return image;
  }

  // ---- 폴리라인 ----

  static const _polylineId = 'recap-route';

  Future<void> _syncPolyline() async {
    final c = _controller;
    if (c == null) return;
    final line = widget.polyline;
    await c.deleteOverlay(
        const NOverlayInfo(type: NOverlayType.polylineOverlay, id: _polylineId));
    if (line == null || line.length < 2) return;
    await c.addOverlay(NPolylineOverlay(
      id: _polylineId,
      coords: line.map((p) => NLatLng(p.lat, p.lng)).toList(growable: false),
      color: const Color(0xFFE2638A), // 마시멜로 핑크(웹판과 동일)
      width: 5,
      lineCap: NLineCap.round,
      lineJoin: NLineJoin.round,
    ));
  }

  // ---- 빌드 ----

  @override
  Widget build(BuildContext context) {
    if (!Env.naverMapConfigured) {
      // 미설정 빌드(테스트·시크릿 없는 CI)도 죽은 화면이 되지 않게(ux §7 에러 상태).
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('지도 설정이 없어요 (NAVER_MAP_CLIENT_ID)',
              textAlign: TextAlign.center),
        ),
      );
    }
    return Stack(
      children: [
        NaverMap(
          options: NaverMapViewOptions(
            initialCameraPosition:
                const NCameraPosition(target: _defaultCenter, zoom: 11),
            // ★ C1의 심장 — 시트가 가리는 높이를 논리 뷰포트에서 제외.
            //   카메라·fitBounds·로고 위치가 전부 이 기준으로 잡힌다.
            contentPadding: EdgeInsets.only(bottom: widget.bottomOcclusionPx),
            logoAlign: NLogoAlign.leftBottom,
            scaleBarEnable: true,
            indoorEnable: false,
            locationButtonEnable: false, // 우리 버튼을 쓴다(권한 맥락 요청 규율)
          ),
          onMapReady: _onMapReady,
          onMapTapped: (_, _) => widget.onMapTap?.call(),
          onCameraChange: (reason, _) {
            // 제스처만 사용자 조작으로 — 프로그램적 이동의 오탐이 원천적으로 없다
            // (웹판이 dragend만 들어 zoom_changed 오탐을 피하던 것의 정식 대체).
            if (reason == NCameraUpdateReason.gesture) {
              _policy.onUserPanned();
            }
          },
          onCameraIdle: () async {
            final c = _controller;
            if (c == null) return;
            final pos = await c.getCameraPosition();
            if (!mounted) return;
            if (pos.zoom != _zoom) {
              _zoom = pos.zoom;
              _requestRender(); // 줌 변경 → 클러스터 재계산(diff가 변경분만 적용)
            }
          },
        ),
        // '내 위치' — 우리가 그리는 버튼(≥44px 터치 타깃, aria 동등 라벨).
        Positioned(
          right: 12,
          bottom: widget.bottomOcclusionPx + 12,
          child: _LocateButton(busy: _locating, onPressed: _locate),
        ),
        if (_toast != null)
          Positioned(
            left: 16,
            right: 16,
            bottom: widget.bottomOcclusionPx + 72,
            child: _Toast(
              message: _toast!,
              onDismiss: () => setState(() => _toast = null),
            ),
          ),
      ],
    );
  }
}

class _LocateButton extends StatelessWidget {
  const _LocateButton({required this.busy, required this.onPressed});
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '내 위치로 이동',
      button: true,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        shape: const CircleBorder(),
        elevation: 2,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: busy ? null : onPressed,
          child: SizedBox(
            width: 44,
            height: 44,
            child: busy
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location, size: 20),
          ),
        ),
      ),
    );
  }
}

class _Toast extends StatelessWidget {
  const _Toast({required this.message, required this.onDismiss});
  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.inverseSurface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onDismiss,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(
            message,
            style: TextStyle(color: scheme.onInverseSurface, fontSize: 14),
          ),
        ),
      ),
    );
  }
}
