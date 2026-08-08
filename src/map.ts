import L from 'leaflet';
import type { GpsCoordinates, OfficeLocation } from './types';

let map: L.Map | null = null;
let userMarker: L.Marker | null = null;
let officeCircle: L.Circle | null = null;
let officeMarker: L.Marker | null = null;
let attendanceMarkers: L.Marker[] = [];

const userIcon = L.divIcon({
  className: '',
  html: `<div class="map-user-pin">
    <div class="map-user-pin__dot"></div>
    <div class="map-user-pin__ring"></div>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const officeIcon = L.divIcon({
  className: '',
  html: `<div class="map-office-pin">🏢</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const clockInIcon = L.divIcon({
  className: '',
  html: `<div class="map-record-pin map-record-pin--in">▲</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const clockOutIcon = L.divIcon({
  className: '',
  html: `<div class="map-record-pin map-record-pin--out">▼</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export function initMap(containerId: string, office: OfficeLocation): void {
  if (map) return;

  map = L.map(containerId, {
    zoomControl: false,
    attributionControl: false,
  }).setView([office.latitude, office.longitude], 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Office location circle
  officeCircle = L.circle([office.latitude, office.longitude], {
    radius: office.radius,
    color: '#4f8ef7',
    fillColor: '#4f8ef7',
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '6 4',
  }).addTo(map);

  officeMarker = L.marker([office.latitude, office.longitude], { icon: officeIcon })
    .addTo(map)
    .bindPopup(`<b>${office.name}</b><br>Radius: ${office.radius}m`);
}

export function updateUserPosition(gps: GpsCoordinates): void {
  if (!map) return;
  const latlng: L.LatLngTuple = [gps.latitude, gps.longitude];

  if (userMarker) {
    userMarker.setLatLng(latlng);
  } else {
    userMarker = L.marker(latlng, { icon: userIcon })
      .addTo(map)
      .bindPopup(`<b>Lokasi Anda</b><br>Akurasi: ±${gps.accuracy.toFixed(0)}m`);
  }
  map.flyTo(latlng, 17, { animate: true, duration: 1.2 });
}

export function addAttendanceMarker(
  gps: GpsCoordinates,
  type: 'in' | 'out',
  label: string
): void {
  if (!map) return;
  const icon = type === 'in' ? clockInIcon : clockOutIcon;
  const marker = L.marker([gps.latitude, gps.longitude], { icon })
    .addTo(map)
    .bindPopup(`<b>${label}</b><br>${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`);
  attendanceMarkers.push(marker);
}

export function clearAttendanceMarkers(): void {
  attendanceMarkers.forEach(m => m.remove());
  attendanceMarkers = [];
}

export function updateOfficeLocation(office: OfficeLocation): void {
  if (!map) return;
  const latlng: L.LatLngTuple = [office.latitude, office.longitude];
  officeCircle?.setLatLng(latlng).setRadius(office.radius);
  officeMarker?.setLatLng(latlng);
  map.flyTo(latlng, 16, { animate: true, duration: 1.0 });
}

export function resizeMap(): void {
  map?.invalidateSize();
}

export function getMap(): L.Map | null {
  return map;
}

let hrMap: L.Map | null = null;
let hrOfficeMarker: L.Marker | null = null;
let hrOfficeCircle: L.Circle | null = null;

export function initHrSettingsMap(
  containerId: string, 
  office: OfficeLocation, 
  onChange: (lat: number, lng: number) => void
): void {
  if (hrMap) {
    hrMap.invalidateSize();
    const latlng: L.LatLngTuple = [office.latitude, office.longitude];
    hrMap.setView(latlng, 16);
    hrOfficeMarker?.setLatLng(latlng);
    hrOfficeCircle?.setLatLng(latlng).setRadius(office.radius);
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  hrMap = L.map(containerId, {
    zoomControl: false,
    attributionControl: false,
  }).setView([office.latitude, office.longitude], 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(hrMap);

  L.control.zoom({ position: 'bottomright' }).addTo(hrMap);

  hrOfficeCircle = L.circle([office.latitude, office.longitude], {
    radius: office.radius,
    color: '#4f8ef7',
    fillColor: '#4f8ef7',
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '6 4',
  }).addTo(hrMap);

  hrOfficeMarker = L.marker([office.latitude, office.longitude], { icon: officeIcon, draggable: true })
    .addTo(hrMap)
    .bindPopup('Geser pin atau klik peta untuk mengatur lokasi');

  // Handle marker drag
  hrOfficeMarker.on('dragend', () => {
    const pos = hrOfficeMarker!.getLatLng();
    hrOfficeCircle?.setLatLng(pos);
    onChange(pos.lat, pos.lng);
  });

  // Handle map click
  hrMap.on('click', (e) => {
    const latlng = e.latlng;
    hrOfficeMarker?.setLatLng(latlng);
    hrOfficeCircle?.setLatLng(latlng);
    onChange(latlng.lat, latlng.lng);
  });
}

export function updateHrSettingsMapRadius(radius: number): void {
  if (hrOfficeCircle) {
    hrOfficeCircle.setRadius(radius);
  }
}

export function updateHrSettingsMapLocation(lat: number, lng: number): void {
  const latlng: L.LatLngTuple = [lat, lng];
  if (hrOfficeMarker) hrOfficeMarker.setLatLng(latlng);
  if (hrOfficeCircle) hrOfficeCircle.setLatLng(latlng);
  if (hrMap) hrMap.setView(latlng, hrMap.getZoom(), { animate: true });
}
