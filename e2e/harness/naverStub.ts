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
  function LatLngBounds() {}
  LatLngBounds.prototype.extend = function () { return this; };
  function Circle() {}
  Circle.prototype.setMap = function () {};
  Circle.prototype.setCenter = function () {};
  Circle.prototype.setRadius = function () {};
  Circle.prototype.setOptions = function () {};
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
  Map.prototype.fitBounds = function () {};
  var Event = {
    addListener: function (t, name, fn) { var h = { target: t, name: name, fn: fn }; return h; },
    removeListener: function () {},
  };
  window.naver = { maps: { Map: Map, LatLng: LatLng, LatLngBounds: LatLngBounds, Point: Point, Marker: Marker, Circle: Circle, Event: Event } };
})();
`
