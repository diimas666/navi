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
  stops?: Destination[];
  routeColor: string;
  language: string;
  fitToken: number;
  showUser: boolean;
  placeIcons: boolean;
  nearby: NearbyPlace[];
  night?: boolean;
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
  stops = [],
  routeColor,
  language,
  fitToken,
  showUser,
  placeIcons,
  nearby,
  night = false,
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
  const nightRef = useRef(night);
  nightRef.current = night;

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
    send(`window.navi.places(${placeIconsRef.current ? 1 : 0},${nightRef.current ? 1 : 0})`);
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
    send(`window.navi.stops(${JSON.stringify(stops)})`);
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
  }, [placeIcons, night]);

  const marksKey = nearby.map(item => item.id).join(',');
  useEffect(() => {
    pushMarks();
    // marksKey covers the nearby payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  const stopsKey = stops.map(item => `${item.latitude},${item.longitude}`).join('|');
  const routeKey = `${route?.distanceM ?? 0}:${route?.coordinates.length ?? 0}:${alternatives.length}:${destination?.latitude ?? ''}:${destination?.longitude ?? ''}:${destination?.name ?? ''}:${stopsKey}:${routeColor}:${fitToken}:${tracking ? 1 : 0}`;
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
        {featureType: 'transit.station', stylers: [{visibility: 'on'}]},
        {featureType: 'administrative.neighborhood', stylers: [{visibility: 'on'}]}
      ];
    }
    return [
      {featureType: 'poi', stylers: [{visibility: 'off'}]},
      {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
      {featureType: 'administrative.neighborhood', stylers: [{visibility: 'on'}]}
    ];
  }
  function nightStyle(){
    return [
      {elementType: 'geometry', stylers: [{color: '#1d1e22'}]},
      {elementType: 'labels.text.fill', stylers: [{color: '#8a8d96'}]},
      {elementType: 'labels.text.stroke', stylers: [{color: '#1d1e22'}]},
      {featureType: 'road', elementType: 'geometry', stylers: [{color: '#2b2d33'}]},
      {featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#16171b'}]},
      {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0e1620'}]},
      {featureType: 'landscape', elementType: 'geometry', stylers: [{color: '#22242a'}]}
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
  var stopMarks = [];
  var user = null;
  var following = true;
  var dragging = false;
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
      following = !!follow && !dragging;
      if (following) {
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
    stops: function(items){
      stopMarks.forEach(function(item){ item.setMap(null); });
      stopMarks = (items || []).map(function(item, index){
        return new google.maps.Marker({
          map: map,
          position: {lat: item.latitude, lng: item.longitude},
          title: item.name || '',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#6B4EE0',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3
          },
          label: {text: String.fromCharCode(65 + (index % 26)), color: '#ffffff', fontSize: '12px', fontWeight: '800'},
          zIndex: 6
        });
      });
    },
    fit: function(){
      if (path.length < 2) return;
      var bounds = new google.maps.LatLngBounds();
      path.forEach(function(point){ bounds.extend({lat: point[1], lng: point[0]}); });
      map.fitBounds(bounds, {top: 120, right: 48, bottom: 280, left: 48});
    },
    places: function(on, dark){
      placesOn = !!on;
      map.setOptions({clickableIcons: placesOn, styles: placeStyle(placesOn).concat(dark ? nightStyle() : [])});
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
  var cityLabels = ${cityLabels};
  var hoodLabels = ${hoodLabels};
  var cityMarks = [];
  var hoodMarks = [];
  function blankIcon(){
    return {
      url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      size: new google.maps.Size(1, 1),
      anchor: new google.maps.Point(0, 0),
      labelOrigin: new google.maps.Point(0, 0)
    };
  }
  function makeLabel(item, size, color){
    return new google.maps.Marker({
      map: map,
      position: {lat: item.lat, lng: item.lon},
      clickable: false,
      icon: blankIcon(),
      label: {text: item.name, color: color, fontSize: size, fontWeight: '700'},
      visible: false,
      zIndex: 1
    });
  }
  cityLabels.forEach(function(item){ cityMarks.push(makeLabel(item, '13px', '#3F4654')); });
  function refreshLabels(){
    var z = map.getZoom() || 0;
    var bounds = map.getBounds();
    cityMarks.forEach(function(mark){
      mark.setVisible(z >= 8.8 && z <= 16);
    });
    hoodMarks.forEach(function(mark){ mark.setMap(null); });
    hoodMarks = [];
    if (!bounds || z < 12.2 || z > 17) return;
    hoodLabels.forEach(function(item){
      if (hoodMarks.length >= 36) return;
      if (!bounds.contains({lat: item.lat, lng: item.lon})) return;
      var mark = makeLabel(item, '12px', '#5A6270');
      mark.setVisible(true);
      hoodMarks.push(mark);
    });
  }
  map.addListener('dragstart', function(){
    dragging = true;
    following = false;
    post({type:'gesture', holding:true, zoom: map.getZoom()});
  });
  map.addListener('idle', function(){
    refreshLabels();
    var center = map.getCenter();
    if (center) post({type:'look', lat: center.lat(), lng: center.lng(), zoom: map.getZoom()});
    if (dragging) {
      dragging = false;
      post({type:'gesture', holding:false, zoom: map.getZoom()});
    } else if (!following) {
      post({type:'gesture', holding:false, zoom: map.getZoom()});
    }
  });
  refreshLabels();
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
