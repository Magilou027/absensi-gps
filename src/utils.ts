import type { GpsCoordinates, AttendanceRecord, AppConfig, Employee } from './types';

// ─── Storage Keys ───────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  RECORDS: 'absensi_records',
  EMPLOYEE: 'absensi_employee',
  CONFIG: 'absensi_config',
} as const;

// ─── Default Config ─────────────────────────────────────────────────────────
export const DEFAULT_CONFIG: AppConfig = {
  officeLocation: {
    name: 'Kantor Pusat',
    latitude: -6.2088,
    longitude: 106.8456,
    radius: 200,
  },
  workStartTime: '08:00',
  workEndTime: '17:00',
  lateThresholdMinutes: 15,
};

export const DEFAULT_EMPLOYEE: Employee = {
  id: 'EMP001',
  name: 'Nama Karyawan',
  position: 'Staff',
  department: 'Umum',
};

// ─── Date / Time Helpers ────────────────────────────────────────────────────
export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\./g, ':');
}

export function formatTimeShort(date: Date = new Date()): string {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\./g, ':');
}

export function getISODate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  return `${h} jam ${m} menit`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── GPS Helpers ─────────────────────────────────────────────────────────────
export function getCurrentPosition(): Promise<GpsCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung oleh browser ini.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        let msg = 'Gagal mendapatkan lokasi GPS.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = 'Izin lokasi ditolak. Aktifkan GPS di browser.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Lokasi tidak tersedia saat ini.';
            break;
          case err.TIMEOUT:
            msg = 'Waktu permintaan GPS habis. Coba lagi.';
            break;
        }
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'id' } }
    );
    const data = await res.json();
    return data.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────
export function saveRecords(records: AttendanceRecord[]): void {
  localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
}

export function loadRecords(): AttendanceRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) ?? '[]');
  } catch {
    return [];
  }
}

export function saveEmployee(employee: Employee): void {
  localStorage.setItem(STORAGE_KEYS.EMPLOYEE, JSON.stringify(employee));
}

export function loadEmployee(): Employee {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEE) ?? 'null') ?? DEFAULT_EMPLOYEE;
  } catch {
    return DEFAULT_EMPLOYEE;
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
}

export function loadConfig(): AppConfig {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) ?? 'null') ?? DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ─── Attendance Status ────────────────────────────────────────────────────────
export function getAttendanceStatus(
  clockInTime: Date,
  config: AppConfig
): 'on-time' | 'late' {
  const workStart = parseTimeToMinutes(config.workStartTime);
  const clockInMin = clockInTime.getHours() * 60 + clockInTime.getMinutes();
  return clockInMin <= workStart + config.lateThresholdMinutes ? 'on-time' : 'late';
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
export function exportToCSV(records: AttendanceRecord[]): void {
  const header = ['ID', 'Tanggal', 'Nama', 'Jabatan', 'Clock In', 'Clock Out',
    'Durasi', 'Status', 'Lat In', 'Lng In', 'Akurasi In', 'Alamat In'];
  const rows = records.map(r => [
    r.id,
    r.date,
    r.employeeName,
    '',
    r.clockIn?.time ? new Date(r.clockIn.time).toLocaleTimeString('id-ID') : '-',
    r.clockOut?.time ? new Date(r.clockOut.time).toLocaleTimeString('id-ID') : '-',
    r.workDuration ? minutesToDuration(r.workDuration) : '-',
    r.clockIn?.status ?? '-',
    r.clockIn?.gps.latitude.toFixed(6) ?? '-',
    r.clockIn?.gps.longitude.toFixed(6) ?? '-',
    r.clockIn?.gps.accuracy.toFixed(1) ?? '-',
    r.clockIn?.address ?? '-',
  ]);
  const csv = [header, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `absensi_${getISODate()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
