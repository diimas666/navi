import {useEffect, useMemo, useRef, type ComponentType, type Ref} from 'react';
import {StyleSheet, TurboModuleRegistry} from 'react-native';
import type {WebView, WebViewMessageEvent} from 'react-native-webview';

import {GOOGLE_MAPS_KEY} from '../constants/googleMapsKey';
import type {RoutePlan} from '../models/domain';
import {driveFocal} from '../services/maps/cameraPull';
import {cityDistrictLabels, districtLabels} from '../services/maps/districts';
import {nearbyColors, nearbyMarks, type NearbyPlace} from '../services/maps/nearbyPlaces';

export function googleWebViewReady(): boolean {
  return TurboModuleRegistry.get('RNCWebViewModule') != null;
}

type Destination = {longitude: number; latitude: number; name?: string};

type Props = {
  latitude: number;
  longitude: number;
  zoom: number;
  heading: number;
  follow: boolean;
  tracking: boolean;
  frame: number;
  route: RoutePlan | null;
  alternatives: RoutePlan[];
  destination: Destination | null;
  routeColor: string;
  language: string;
  fitToken: number;
  showUser: boolean;
  placeIcons: boolean;
  nearby: NearbyPlace[];
  onUserMove?: (zoom: number) => void;
  onGesture?: (holding: boolean, zoom: number) => void;
  onLook?: (latitude: number, longitude: number, zoom: number) => void;
  onMapPress?: (longitude: number, latitude: number) => void;
  onPlace?: (place: NearbyPlace) => void;
  onAlternative?: (route: RoutePlan) => void;
  onReady?: () => void;
  onFail?: () => void;
};

export function GoogleRoadMap({
  latitude,
  longitude,
  zoom,
  heading,
  follow,
  tracking,
  frame,
  route,
  alternatives,
  destination,
  routeColor,
  language,
  fitToken,
  showUser,
  placeIcons,
  nearby,
  onUserMove,
  onGesture,
  onLook,
  onMapPress,
  onPlace,
  onAlternative,
  onReady,
  onFail,
}: Props) {
  const web = useRef<WebView>(null);
  const WebViewComponent = require('react-native-webview').WebView as ComponentType<{
    ref?: Ref<WebView>;
    style?: object;
    originWhitelist?: string[];
    source?: {html: string; baseUrl?: string};
    onMessage?: (event: WebViewMessageEvent) => void;
    onError?: () => void;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    setSupportMultipleWindows?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    showsVerticalScrollIndicator?: boolean;
    bounces?: boolean;
    scrollEnabled?: boolean;
  }>;
  const ready = useRef(false);
  const alternativesRef = useRef(alternatives);
  alternativesRef.current = alternatives;
  const handlers = useRef({onUserMove, onGesture, onLook, onMapPress, onPlace, onAlternative, onReady, onFail});
  handlers.current = {onUserMove, onGesture, onLook, onMapPress, onPlace, onAlternative, onReady, onFail};
  const placeIconsRef = useRef(placeIcons);
  placeIconsRef.current = placeIcons;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready.current) {
        handlers.current.onFail?.();
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const html = useMemo(
    () => mapPage(latitude, longitude, zoom, language, placeIcons),
    // The page is created once. Later camera and route updates go through injectJavaScript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const send = (script: string) => {
    if (!ready.current) {
      return;
    }
    web.current?.injectJavaScript(`${script};true;`);
  };

  const pushView = () => {
    const focal = follow && tracking ? driveFocal(frame) : frame / 2;
    send(
      `window.navi.view(${latitude},${longitude},${zoom},${follow ? 1 : 0},${focal},${frame},${heading},${showUser ? 1 : 0})`,
    );
  };

  const pushPlaces = () => {
    send(`window.navi.places(${placeIconsRef.current ? 1 : 0})`);
  };

  const pushMarks = () => {
    send(`window.navi.marks(${JSON.stringify(nearby)})`);
  };

  const pushRoute = () => {
    send(`window.navi.route(${JSON.stringify(route?.coordinates ?? [])},${JSON.stringify(routeColor)})`);
    send(`window.navi.alts(${JSON.stringify(alternatives.map(item => item.coordinates))})`);
    if (destination) {
      send(
        `window.navi.dest(${destination.latitude},${destination.longitude},${JSON.stringify(destination.name ?? '')})`,
      );
    } else {
      send('window.navi.dest(null)');
    }
    if (!tracking && route && route.coordinates.length > 1 && fitToken > 0) {
      send('window.navi.fit()');
    }
  };

  useEffect(() => {
    pushView();
    // Camera follows the latest fix. Route drawing is a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, zoom, follow, tracking, frame, heading, showUser]);

  useEffect(() => {
    pushPlaces();
    // The map page is created once. The switch only flips Google's place icons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeIcons]);

  const marksKey = nearby.map(item => item.id).join(',');
  useEffect(() => {
    pushMarks();
    // marksKey covers the nearby payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  const routeKey = `${route?.distanceM ?? 0}:${route?.coordinates.length ?? 0}:${alternatives.length}:${destination?.latitude ?? ''}:${destination?.longitude ?? ''}:${destination?.name ?? ''}:${routeColor}:${fitToken}:${tracking ? 1 : 0}`;
  useEffect(() => {
    pushRoute();
    // routeKey covers the route payload. pushRoute reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: {
      type?: string;
      holding?: boolean;
      zoom?: number;
      lat?: number;
      lng?: number;
      index?: number;
      name?: string;
      id?: string;
      kind?: NearbyPlace['kind'];
    };
    try {
      data = JSON.parse(event.nativeEvent.data) as typeof data;
    } catch {
      return;
    }
    if (data.type === 'ready') {
      ready.current = true;
      handlers.current.onReady?.();
      pushView();
      pushRoute();
      pushPlaces();
      pushMarks();
      return;
    }
    if (data.type === 'fail') {
      handlers.current.onFail?.();
      return;
    }
    if (data.type === 'look' && data.lat != null && data.lng != null) {
      handlers.current.onLook?.(data.lat, data.lng, data.zoom ?? zoom);
      return;
    }
    if (data.type === 'gesture') {
      handlers.current.onGesture?.(Boolean(data.holding), data.zoom ?? zoom);
      if (!data.holding) {
        handlers.current.onUserMove?.(data.zoom ?? zoom);
      }
      return;
    }
    if (data.type === 'place' && data.lat != null && data.lng != null && data.id) {
      handlers.current.onPlace?.({
        id: data.id,
        name: data.name ?? '',
        kind: data.kind ?? 'gov',
        latitude: data.lat,
        longitude: data.lng,
      });
      return;
    }
    if (data.type === 'press' && data.lat != null && data.lng != null) {
      handlers.current.onMapPress?.(data.lng, data.lat);
      return;
    }
    if (data.type === 'alt' && data.index != null) {
      const picked = alternativesRef.current[data.index];
      if (picked) {
        handlers.current.onAlternative?.(picked);
      }
    }
  };

  return (
    <WebViewComponent
      ref={web}
      style={styles.fill}
      originWhitelist={['*']}
      source={{html, baseUrl: 'https://localhost'}}
      onMessage={onMessage}
      onError={() => onFail?.()}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bounces={false}
      scrollEnabled={false}
    />
  );
}

function mapPage(
  latitude: number,
  longitude: number,
  zoom: number,
  language: string,
  placeIcons: boolean,
): string {
  const lang = language === 'ru' || language === 'en' ? language : 'uk';
  const safe = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const cityLabels = safe(cityDistrictLabels());
  const hoodLabels = safe(districtLabels());
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
html,body,#map{height:100%;margin:0;background:#e8e4f2}
.lbl{display:none;position:absolute;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;
  font-family:-apple-system,Helvetica,Arial,sans-serif;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 5px #fff}
.lbl.city{font-size:11px;font-weight:700;letter-spacing:.09em;color:#7E8794}
.lbl.hood{font-size:12px;font-weight:600;color:#6E7680}
body.showCity .lbl.city,body.showHood .lbl.hood{display:block}
</style>
</head>
<body>
<div id="map"></div>
<script>
function post(payload){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload)); }
window.gm_authFailure = function(){ post({type:'fail'}); };
function initMap(){
  function placeStyle(on) {
    if (on) {
      return [
        {featureType: 'poi', stylers: [{visibility: 'on'}]},
        {featureType: 'poi.business', stylers: [{visibility: 'on'}]},
        {featureType: 'poi.medical', stylers: [{visibility: 'on'}]},
        {featureType: 'poi.government', stylers: [{visibility: 'on'}]},
        {featureType: 'transit', stylers: [{visibility: 'on'}]},
        {featureType: 'transit.station', stylers: [{visibility: 'on'}]}
      ];
    }
    return [
      {featureType: 'poi', stylers: [{visibility: 'off'}]},
      {featureType: 'transit.station', stylers: [{visibility: 'off'}]}
    ];
  }
  var placesOn = ${placeIcons ? 'true' : 'false'};
  var map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: ${latitude}, lng: ${longitude}},
    zoom: ${zoom},
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    clickableIcons: placesOn,
    keyboardShortcuts: false,
    backgroundColor: '#e8e4f2',
    styles: placeStyle(placesOn)
  });
  var path = [];
  var line = null;
  var altLines = [];
  var dest = null;
  var user = null;
  var following = true;
  var placeService = null;
  var marks = [];
  var colors = ${JSON.stringify(nearbyColors)};
  var letters = ${JSON.stringify(nearbyMarks)};
  function markIcon(kind){
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: colors[kind] || '#5D6D7E',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    };
  }
  function arrow(rotation){
    return {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 7,
      fillColor: '#1A73E8',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      rotation: rotation
    };
  }
  function shifted(lat, lng, zoomLevel, focal, height){
    var shift = focal - height / 2;
    var scale = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoomLevel);
    return {lat: lat + (shift * scale) / 111320, lng: lng};
  }
  window.navi = {
    view: function(lat, lng, zoomLevel, follow, focal, height, heading, showUser){
      following = !!follow;
      if (follow) {
        map.moveCamera({center: shifted(lat, lng, zoomLevel, focal, height), zoom: zoomLevel});
      }
      if (showUser) {
        if (!user) user = new google.maps.Marker({map: map, icon: arrow(heading), zIndex: 5});
        user.setPosition({lat: lat, lng: lng});
        user.setIcon(arrow(heading));
      } else if (user) {
        user.setMap(null);
        user = null;
      }
    },
    route: function(coords, color){
      path = coords || [];
      if (line) line.setMap(null);
      line = null;
      if (path.length < 2) return;
      line = new google.maps.Polyline({
        map: map,
        path: path.map(function(point){ return {lat: point[1], lng: point[0]}; }),
        strokeColor: color || '#6B4EE0',
        strokeWeight: 7,
        zIndex: 3
      });
    },
    alts: function(groups){
      altLines.forEach(function(item){ item.setMap(null); });
      altLines = (groups || []).map(function(coords, index){
        var poly = new google.maps.Polyline({
          map: map,
          path: coords.map(function(point){ return {lat: point[1], lng: point[0]}; }),
          strokeColor: '#9AA3AE',
          strokeWeight: 5,
          zIndex: 2
        });
        poly.addListener('click', function(){ post({type:'alt', index: index}); });
        return poly;
      });
    },
    dest: function(lat, lng, name){
      if (dest) dest.setMap(null);
      dest = null;
      if (lat == null || lng == null) return;
      dest = new google.maps.Marker({
        map: map,
        position: {lat: lat, lng: lng},
        title: name || '',
        label: name ? {text: name.slice(0, 28), color: '#1C1430', fontSize: '12px', fontWeight: '700'} : undefined,
        zIndex: 4
      });
    },
    fit: function(){
      if (path.length < 2) return;
      var bounds = new google.maps.LatLngBounds();
      path.forEach(function(point){ bounds.extend({lat: point[1], lng: point[0]}); });
      map.fitBounds(bounds, {top: 120, right: 48, bottom: 280, left: 48});
    },
    places: function(on){
      placesOn = !!on;
      map.setOptions({clickableIcons: placesOn, styles: placeStyle(placesOn)});
      if (!placesOn) window.navi.marks([]);
    },
    marks: function(items){
      marks.forEach(function(item){ item.setMap(null); });
      marks = [];
      if (!placesOn) return;
      (items || []).forEach(function(item){
        var pin = new google.maps.Marker({
          map: map,
          position: {lat: item.latitude, lng: item.longitude},
          title: item.name || '',
          icon: markIcon(item.kind),
          label: {text: letters[item.kind] || '•', color: '#ffffff', fontSize: '11px', fontWeight: '700'},
          zIndex: 3
        });
        pin.addListener('click', function(){
          post({type:'place', id: item.id, name: item.name || '', kind: item.kind, lat: item.latitude, lng: item.longitude});
        });
        marks.push(pin);
      });
    }
  };
  function Label(lat, lng, text, kind){
    this.pos = new google.maps.LatLng(lat, lng);
    this.text = text;
    this.kind = kind;
    this.div = null;
    this.setMap(map);
  }
  Label.prototype = new google.maps.OverlayView();
  Label.prototype.onAdd = function(){
    var div = document.createElement('div');
    div.className = 'lbl ' + this.kind;
    div.textContent = this.text;
    this.div = div;
    this.getPanes().overlayLayer.appendChild(div);
  };
  Label.prototype.draw = function(){
    var projection = this.getProjection();
    if (!projection || !this.div) return;
    var point = projection.fromLatLngToDivPixel(this.pos);
    if (!point) return;
    this.div.style.left = point.x + 'px';
    this.div.style.top = point.y + 'px';
  };
  Label.prototype.onRemove = function(){
    if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
    this.div = null;
  };
  var cityLabels = ${cityLabels};
  var hoodLabels = ${hoodLabels};
  cityLabels.forEach(function(item){ new Label(item.lat, item.lon, item.name, 'city'); });
  hoodLabels.forEach(function(item){ new Label(item.lat, item.lon, item.name, 'hood'); });
  function labelZoom(){
    var z = map.getZoom() || 0;
    document.body.classList.toggle('showCity', z >= 9.5 && z <= 14.6);
    document.body.classList.toggle('showHood', z >= 13 && z <= 16.4);
  }
  map.addListener('zoom_changed', labelZoom);
  labelZoom();
  map.addListener('dragstart', function(){ following = false; post({type:'gesture', holding:true, zoom: map.getZoom()}); });
  map.addListener('idle', function(){
    var center = map.getCenter();
    if (center) post({type:'look', lat: center.lat(), lng: center.lng(), zoom: map.getZoom()});
    if (!following) post({type:'gesture', holding:false, zoom: map.getZoom()});
  });
  map.addListener('click', function(event){
    if (placesOn && event.placeId) {
      if (event.stop) event.stop();
      var lat = event.latLng ? event.latLng.lat() : null;
      var lng = event.latLng ? event.latLng.lng() : null;
      if (!placeService && google.maps.places) {
        placeService = new google.maps.places.PlacesService(map);
      }
      if (!placeService || lat == null || lng == null) {
        if (lat != null && lng != null) post({type:'place', id: event.placeId, name:'', kind:'gov', lat:lat, lng:lng});
        return;
      }
      placeService.getDetails({
        placeId: event.placeId,
        fields: ['name', 'geometry', 'types']
      }, function(place, status) {
        var name = '';
        var plat = lat;
        var plng = lng;
        var kind = 'gov';
        if (status === 'OK' && place) {
          name = place.name || '';
          if (place.geometry && place.geometry.location) {
            plat = place.geometry.location.lat();
            plng = place.geometry.location.lng();
          }
          var types = place.types || [];
          if (types.indexOf('pharmacy') >= 0) kind = 'pharmacy';
          else if (types.indexOf('cafe') >= 0) kind = 'cafe';
          else if (types.indexOf('restaurant') >= 0) kind = 'food';
          else if (types.indexOf('train_station') >= 0) kind = 'train';
          else if (types.indexOf('bus_station') >= 0) kind = 'bus';
        }
        if (plat == null || plng == null) return;
        post({type:'place', id: event.placeId, name:name, kind:kind, lat:plat, lng:plng});
      });
      return;
    }
    if (!event.latLng) return;
    post({type:'press', lat: event.latLng.lat(), lng: event.latLng.lng()});
  });
  post({type:'ready'});
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=initMap&language=${lang}&region=UA" onerror="post({type:'fail'})"></script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  fill: {flex: 1, backgroundColor: '#E8E4F2'},
});
