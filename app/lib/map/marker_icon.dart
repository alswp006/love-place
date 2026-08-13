/// 마커 핀 위젯 + 아이콘 캐시 키.
///
/// 웹판 `NaverMap.module.css`의 `.pin`/`.pinBoth`/`.pinVisited`/`.cluster`에 해당.
/// 색은 웹 OKLCH 토큰의 정확한 sRGB 변환값(styles 토큰 → Björn Ottosson 행렬).
/// **색+모양 이중화(§8)**: 상태는 글리프(☆/✦/★)와 배지(✓)로도 구분된다 — 색을
/// 빼도 구분되는 게 계약이다.
///
/// `NOverlayImage.fromWidget`은 위젯을 이미지로 렌더해 캐시한다(SDK 문서: "한번
/// 생성한 객체는 되도록 재사용"). 마커 수백 개여도 아이콘 변형은 몇 개뿐이므로
/// [MarkerIconKey]로 캐시해 변형당 1회만 렌더한다 — 웹판이 마커마다 DOM을 새로
/// 만들던 것(A3)과의 결정적 차이.
library;

import 'package:flutter/material.dart';

import '../places/marker_visual.dart';
import 'marker_diff.dart';

/// 웹 토큰 → sRGB. (light, dark) 쌍.
abstract final class MarkerPalette {
  static const brandLight = Color(0xFFB03D5B); // oklch(53% .15 8)
  static const brandDark = Color(0xFFFD93A7); // oklch(78% .13 8)
  static const sharedLight = Color(0xFF6F57AB); // oklch(52% .13 295)
  static const sharedDark = Color(0xFFBCA9F7); // oklch(78% .11 295)
  static const successLight = Color(0xFF179765); // oklch(60% .13 160)
  static const successDark = Color(0xFF57BC8A); // oklch(72% .12 160)

  static Color pinColor(MarkerKind kind, Brightness brightness) {
    final dark = brightness == Brightness.dark;
    return switch (kind) {
      MarkerKind.wish => dark ? brandDark : brandLight,
      MarkerKind.both => dark ? sharedDark : sharedLight,
      MarkerKind.visited => dark ? successDark : successLight,
    };
  }
}

/// 아이콘 이미지 캐시 키 — 렌더 결과를 바꾸는 속성만 담는다(좌표·라벨 제외).
///
/// [MarkerSpec] 하나당 이미지 하나가 아니라, **같은 키의 spec들이 이미지 하나를
/// 공유**한다.
typedef MarkerIconKey = String;

MarkerIconKey iconKeyOf(MarkerSpec spec, Brightness brightness) => [
      spec.isCluster ? 'c${spec.clusterCount}' : spec.glyph,
      spec.kind.name,
      if (spec.selected) 'sel',
      if (spec.badge != null) 'badge',
      if (spec.order != null) 'o${spec.order}',
      brightness.name,
    ].join('|');

/// 핀 렌더 크기 — 웹판 앵커(22, 44)와 동일 비율. 터치 타깃 ≥44(HIG)는
/// SDK 마커 히트 영역이 이미지 크기를 따르므로 폭 44로 확보.
const Size pinSize = Size(44, 44);
const Size clusterSize = Size(44, 44);

/// 단일 핀 위젯. `NOverlayImage.fromWidget`의 입력.
class PinIcon extends StatelessWidget {
  const PinIcon({
    super.key,
    required this.spec,
    required this.brightness,
  });

  final MarkerSpec spec;
  final Brightness brightness;

  @override
  Widget build(BuildContext context) {
    final color = MarkerPalette.pinColor(spec.kind, brightness);
    final glyphText = spec.order != null ? '${spec.order}' : spec.glyph;
    return SizedBox.fromSize(
      size: pinSize,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 선택 강조 링 — 웹판 selectedMarker의 확대+링에 해당.
          if (spec.selected)
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 2),
                color: color.withValues(alpha: 0.15),
              ),
            ),
          Text(
            glyphText,
            style: TextStyle(
              fontSize: spec.selected ? 26 : 22,
              height: 1,
              color: color,
              fontWeight: spec.order != null ? FontWeight.w700 : null,
              shadows: const [
                // 웹판 text-shadow와 동일 의도 — 지도 위 가독성(흰 테두리+그림자).
                Shadow(color: Colors.white, blurRadius: 2),
                Shadow(
                  color: Color(0x4D000000),
                  offset: Offset(0, 1),
                  blurRadius: 2,
                ),
              ],
            ),
          ),
          // 가봤음 체크 배지 — 색이 아닌 실루엣으로 구분(§8).
          if (spec.badge != null)
            Positioned(
              top: 2,
              right: 4,
              child: Text(
                spec.badge!,
                style: TextStyle(
                  fontSize: 12,
                  height: 1,
                  fontWeight: FontWeight.w700,
                  color: color,
                  shadows: const [Shadow(color: Colors.white, blurRadius: 2)],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 클러스터 배지 위젯 — 색(브랜드)+개수 텍스트 이중화(§8). 원형.
class ClusterIcon extends StatelessWidget {
  const ClusterIcon({
    super.key,
    required this.count,
    required this.brightness,
  });

  final int count;
  final Brightness brightness;

  @override
  Widget build(BuildContext context) {
    final dark = brightness == Brightness.dark;
    return SizedBox.fromSize(
      size: clusterSize,
      child: Center(
        child: Container(
          constraints: const BoxConstraints(minWidth: 36),
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            // 다크: 어두운 면 + 브랜드 아웃라인(웹판 다크 분기와 동일).
            color: dark ? const Color(0xFF2A2233) : MarkerPalette.brandLight,
            border: dark
                ? Border.all(color: MarkerPalette.brandDark, width: 1.5)
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            '$count',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: dark ? const Color(0xFFF4EFF7) : Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
