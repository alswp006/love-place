// e2e/harness/naverStub.ts — Playwright 하베스용 네이버 SDK 스텁(지도 타일 없이 DOM만).
// page.route로 oapi 스크립트 URL을 이 본문으로 fulfill → 실행되면 window.naver.maps 설정 →
// loadNaverMaps의 onload + window.naver?.maps 체크가 통과(dossier 04 §D.2).
export const NAVER_SCRIPT_GLOB = 'https://oapi.map.naver.com/openapi/v3/maps.js**'

export const NAVER_STUB_JS = `
(function () {
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild || d; }
  function Point(x, y) { this.x = x; this.y = y; }
  function LatLng(lat, lng) { this._lat = lat; this._lng = lng; }
  LatLng.prototype.lat = function () { return this._lat; };
  LatLng.prototype.lng = function () { return this._lng; };
  // LatLngBounds(sw, ne) — 2-arg 생성자(앱 showSelf/폴백/클러스터 fitBounds가 사용). 스텁은 인자 무시.
  function LatLngBounds() {}
  LatLngBounds.prototype.extend = function () { return this; };
  function Circle() {}
  Circle.prototype.setMap = function () {};
  Circle.prototype.setCenter = function () {};
  Circle.prototype.setRadius = function () {};
  Circle.prototype.setOptions = function () {};
  // Polyline — 리캡 동선(R5). 스텁은 DOM 없이 메서드만(맵 init throw 방지).
  function Polyline(opts) { this._opts = opts || {}; }
  Polyline.prototype.setMap = function () {};
  Polyline.prototype.setPath = function () {};
  Polyline.prototype.getPath = function () { return (this._opts && this._opts.path) || []; };
  Polyline.prototype.setOptions = function () {};
  function Marker(opts) {
    this._opts = opts || {};
    this._pos = this._opts.position;
    this._node = null;
    if (this._opts.map) this.setMap(this._opts.map);
  }
  Marker.prototype.setMap = function (map) {
    if (!map) { if (this._node && this._node.parentNode) this._node.parentNode.removeChild(this._node); this._node = null; return; }
    var host = map._el; if (!host) return;
    var content = this._opts.icon && this._opts.icon.content;
    if (typeof content === 'string') { this._node = el(content); host.appendChild(this._node); }
    this._map = map;
  };
  Marker.prototype.setIcon = function (icon) { this._opts.icon = icon; if (this._map) { this.setMap(null); this.setMap(this._map); } };
  Marker.prototype.setZIndex = function () {};
  Marker.prototype.setPosition = function (p) { this._pos = p; };
  Marker.prototype.getPosition = function () { return this._pos; };
  function Map(elOrId, opts) {
    this._el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    this._opts = opts || {};
  }
  Map.prototype.getZoom = function () { return this._opts.zoom || 11; };
  Map.prototype.setZoom = function (z) { this._opts.zoom = z; };
  Map.prototype.getCenter = function () { return this._opts.center; };
  Map.prototype.setCenter = function (c) { this._opts.center = c; };
  Map.prototype.panTo = function (c) { this._opts.center = c; };
  Map.prototype.fitBounds = function (b) { this._lastFitBounds = b; };
  var Event = {
    addListener: function (t, name, fn) { var h = { target: t, name: name, fn: fn }; return h; },
    removeListener: function () {},
  };
  // Position enum — NaverMap이 logoControlOptions/scaleControlOptions에 nv.maps.Position.TOP_LEFT/TOP_RIGHT를
  // 참조하므로 스텁에도 제공해야 map init이 throw하지 않는다(R1.3).
  var Position = { CENTER: 0, TOP_LEFT: 1, TOP_CENTER: 2, TOP_RIGHT: 3, LEFT_CENTER: 4, RIGHT_CENTER: 6, BOTTOM_LEFT: 7, BOTTOM_CENTER: 8, BOTTOM_RIGHT: 9 };
  window.naver = { maps: { Map: Map, LatLng: LatLng, LatLngBounds: LatLngBounds, Point: Point, Marker: Marker, Circle: Circle, Polyline: Polyline, Event: Event, Position: Position } };
})();
`
