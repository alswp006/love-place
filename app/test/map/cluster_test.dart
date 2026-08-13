import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/cluster.dart';
import 'package:weave/map/sheet_snap.dart';

void main() {
  group('clusterPlaces', () {
    test('빈 입력은 빈 결과', () {
      expect(clusterPlaces(const [], 12), isEmpty);
    });

    test('멀리 떨어진 점들은 각각 단일 마커', () {
      final out = clusterPlaces(const [
        ClusterPoint(id: 'seoul', lat: 37.5665, lng: 126.978),
        ClusterPoint(id: 'busan', lat: 35.1796, lng: 129.0756),
      ], 12);
      expect(out.length, 2);
      expect(out.every((e) => e is SingleMarker), isTrue);
    });

    test('같은 셀의 점들은 묶이고 좌표는 centroid', () {
      final out = clusterPlaces(const [
        ClusterPoint(id: 'a', lat: 37.500, lng: 127.000),
        ClusterPoint(id: 'b', lat: 37.502, lng: 127.002),
      ], 12);
      expect(out.length, 1);
      final c = out.first as ClusterMarker;
      expect(c.count, 2);
      expect(c.ids, containsAll(['a', 'b']));
      expect(c.lat, closeTo(37.501, 1e-9));
      expect(c.lng, closeTo(127.001, 1e-9));
    });

    test('줌을 올리면 분해능이 올라가 결국 분리된다', () {
      const pts = [
        ClusterPoint(id: 'a', lat: 37.50000, lng: 127.00000),
        ClusterPoint(id: 'b', lat: 37.50010, lng: 127.00010),
      ];
      expect(clusterPlaces(pts, 12).length, 1); // 낮은 줌: 묶임
      expect(clusterPlaces(pts, 21).length, 2); // 높은 줌: 분리
    });

    test('셀 크기는 줌에 대해 단조 감소', () {
      var prev = double.infinity;
      for (var z = 6.0; z <= 20; z++) {
        final s = cellSizeDeg(z);
        expect(s, lessThan(prev));
        prev = s;
      }
    });

    test('줌 6 이하는 셀 크기가 1.0°로 고정(클램프)', () {
      expect(cellSizeDeg(6), 1.0);
      expect(cellSizeDeg(3), 1.0);
      expect(cellSizeDeg(0), 1.0);
    });

    test('소수 줌도 연속으로 처리한다 — 핀치 중 클러스터가 계단식으로 안 튀게', () {
      // 네이티브 카메라 줌은 double. 정수부만 계산하면 12.0과 12.9의 셀이 같아져
      // 13.0에서 갑자기 절반으로 뛴다(이식 초기 버그).
      expect(cellSizeDeg(12.5), closeTo(1.0 / 90.50966799, 1e-9)); // 2^6.5
      expect(cellSizeDeg(12.5), lessThan(cellSizeDeg(12.0)));
      expect(cellSizeDeg(12.5), greaterThan(cellSizeDeg(13.0)));
    });
  });

  group('boundsSpanTiny — 클러스터 클릭 시 fitBounds vs 줌인 분기', () {
    test('한 점이면 tiny', () {
      expect(
        boundsSpanTiny(const [ClusterPoint(id: 'a', lat: 37.5, lng: 127)]),
        isTrue,
      );
    });

    test('사실상 겹친 점들은 tiny — fitBounds가 무의미하다', () {
      expect(
        boundsSpanTiny(const [
          ClusterPoint(id: 'a', lat: 37.5000000, lng: 127.0000000),
          ClusterPoint(id: 'b', lat: 37.5000001, lng: 127.0000001),
        ]),
        isTrue,
      );
    });

    test('벌어진 점들은 tiny 아님 — fitBounds로 간다', () {
      expect(
        boundsSpanTiny(const [
          ClusterPoint(id: 'a', lat: 37.50, lng: 127.00),
          ClusterPoint(id: 'b', lat: 37.55, lng: 127.05),
        ]),
        isFalse,
      );
    });

    test('임계값은 웹판과 동일한 0.0005°(≈55m) — 수십 m 간격도 tiny다', () {
      // 이식 초기에 1e-6으로 좁혀 옮기는 오류가 있었다. 그러면 ~30m 간격 클러스터를
      // 눌렀을 때 fitBounds가 과확대되는, 웹판이 minDeg로 막아둔 버그가 재발한다.
      expect(
        boundsSpanTiny(const [
          ClusterPoint(id: 'a', lat: 37.5000, lng: 127.0000),
          ClusterPoint(id: 'b', lat: 37.5003, lng: 127.0003), // ≈33m
        ]),
        isTrue,
      );
      expect(
        boundsSpanTiny(const [
          ClusterPoint(id: 'a', lat: 37.5000, lng: 127.0000),
          ClusterPoint(id: 'b', lat: 37.5010, lng: 127.0000), // ≈111m
        ]),
        isFalse,
      );
    });
  });

  group('clusterMemberPts', () {
    test('id 집합에 해당하는 점만 추린다', () {
      const all = [
        ClusterPoint(id: 'a', lat: 1, lng: 1),
        ClusterPoint(id: 'b', lat: 2, lng: 2),
        ClusterPoint(id: 'c', lat: 3, lng: 3),
      ];
      final got = clusterMemberPts(['a', 'c'], all);
      expect(got.map((p) => p.id).toList(), ['a', 'c']);
    });
  });

  group('sheetSnap', () {
    const travel = 700.0;
    const peek = 144.0;

    test('전이는 양끝에서 클램프된다', () {
      expect(nextSnap(SnapStop.peek), SnapStop.half);
      expect(nextSnap(SnapStop.full), SnapStop.full);
      expect(prevSnap(SnapStop.half), SnapStop.peek);
      expect(prevSnap(SnapStop.peek), SnapStop.peek);
    });

    test('peek는 콘텐츠 px만 노출한다', () {
      expect(translateYFor(SnapStop.peek, travel, peek), travel - peek);
    });

    test('가장 가까운 스냅으로 흡착', () {
      final halfY = translateYFor(SnapStop.half, travel, peek);
      expect(snapForOffset(halfY + 5, travel, peek), SnapStop.half);
    });

    test('느린 드래그는 위치 기반, 빠른 플릭은 방향을 따른다', () {
      final halfY = translateYFor(SnapStop.half, travel, peek);
      expect(snapForFlick(halfY, 0.1, travel, peek), SnapStop.half);
      expect(snapForFlick(halfY, -2.0, travel, peek), SnapStop.full); // 위로
      expect(snapForFlick(halfY, 2.0, travel, peek), SnapStop.peek); // 아래로
    });

    test('딤은 peek=0, full=1로 정규화된다', () {
      final peekY = translateYFor(SnapStop.peek, travel, peek);
      final fullY = translateYFor(SnapStop.full, travel, peek);
      expect(dimProgress(peekY, peekY, fullY), 0);
      expect(dimProgress(fullY, peekY, fullY), 1);
      expect(dimProgress((peekY + fullY) / 2, peekY, fullY), closeTo(0.5, 1e-9));
    });

    test('travel이 0이어도 0으로 나누지 않는다', () {
      expect(dimProgress(0, 100, 100), 0);
    });
  });
}
