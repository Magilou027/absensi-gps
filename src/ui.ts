import type { AttendanceRecord, DashboardStats, Employee, AppConfig } from './types';
import { formatTimeShort, minutesToDuration, getISODate } from './utils';

// ─── Toast Notification ───────────────────────────────────────────────────────
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const icons: Record<string, string> = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rose-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  toast.innerHTML = `<span class="toast__icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ─── GPS Status ───────────────────────────────────────────────────────────────
export function setGpsStatus(
  status: 'idle' | 'loading' | 'success' | 'error',
  message: string = '',
  accuracy?: number
): void {
  const el = document.getElementById('gps-status')!;
  const dot = document.getElementById('gps-dot')!;
  const text = document.getElementById('gps-text')!;
  const acc = document.getElementById('gps-accuracy')!;

  el.className = `gps-status gps-status--${status}`;
  dot.className = `gps-dot gps-dot--${status}`;
  text.textContent = message;
  acc.textContent = accuracy !== undefined ? `±${accuracy.toFixed(0)}m` : '';
}

// ─── Clock ────────────────────────────────────────────────────────────────────
export function updateClock(timeStr: string, dateStr: string): void {
  const timeEl = document.getElementById('live-time');
  const dateEl = document.getElementById('live-date');
  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

// ─── Employee Profile ─────────────────────────────────────────────────────────
export function renderEmployee(emp: Employee): void {
  const nameEl = document.getElementById('employee-name');
  const posEl = document.getElementById('employee-position');
  const deptEl = document.getElementById('employee-dept');
  const idEl = document.getElementById('employee-id');
  if (nameEl) nameEl.textContent = emp.name;
  if (posEl) posEl.textContent = emp.position;
  if (deptEl) deptEl.textContent = emp.department;
  if (idEl) idEl.textContent = emp.id;
}

// ─── Attendance Button State ───────────────────────────────────────────────────
export function setAttendanceButtonState(
  hasClockedIn: boolean,
  hasClockedOut: boolean,
  isLoading: boolean
): void {
  const btnIn = document.getElementById('btn-clock-in') as HTMLButtonElement;
  const btnOut = document.getElementById('btn-clock-out') as HTMLButtonElement;
  const spinner = document.getElementById('btn-spinner')!;

  if (isLoading) {
    btnIn.disabled = true;
    btnOut.disabled = true;
    spinner.classList.remove('hidden');
    return;
  }

  spinner.classList.add('hidden');
  btnIn.disabled = hasClockedIn;
  btnOut.disabled = !hasClockedIn || hasClockedOut;

  if (hasClockedIn && !hasClockedOut) {
    btnIn.classList.add('btn--done');
    btnOut.classList.add('btn--active');
  } else if (hasClockedOut) {
    btnIn.classList.add('btn--done');
    btnOut.classList.add('btn--done');
  }
}

// ─── Today Status Card ────────────────────────────────────────────────────────
export function renderTodayStatus(record: AttendanceRecord | null): void {
  const el = document.getElementById('today-status')!;
  if (!record || !record.clockIn) {
    el.innerHTML = `
      <div class="status-empty">
        <div class="status-empty__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        </div>
        <p>Belum ada absensi hari ini</p>
      </div>`;
    return;
  }

  const clockInTime = formatTimeShort(new Date(record.clockIn.time));
  const clockOutTime = record.clockOut
    ? formatTimeShort(new Date(record.clockOut.time))
    : '—';
  const duration = record.workDuration
    ? minutesToDuration(record.workDuration)
    : '—';
  const statusLabel = record.clockIn.status === 'on-time' ? 'Tepat Waktu' : 'Terlambat';
  const statusClass = record.clockIn.status === 'on-time' ? 'badge--success' : 'badge--warning';

  el.innerHTML = `
    <div class="today-grid">
      <div class="today-item">
        <span class="today-label">Clock In</span>
        <span class="today-value today-value--in">${clockInTime}</span>
      </div>
      <div class="today-item">
        <span class="today-label">Clock Out</span>
        <span class="today-value today-value--out">${clockOutTime}</span>
      </div>
      <div class="today-item">
        <span class="today-label">Durasi</span>
        <span class="today-value">${duration}</span>
      </div>
      <div class="today-item">
        <span class="today-label">Status</span>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
    </div>
    ${record.clockIn.address ? `<p class="today-address" style="display:flex;align-items:flex-start;gap:6px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      ${record.clockIn.address}
    </p>` : ''}
  `;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export function renderStats(stats: DashboardStats): void {
  const setVal = (id: string, val: string | number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };
  setVal('stat-present', stats.totalPresent);
  setVal('stat-ontime', stats.totalOnTime);
  setVal('stat-late', stats.totalLate);
  setVal('stat-month', stats.currentMonth);
}

// ─── Attendance History Table ─────────────────────────────────────────────────
export function renderHistoryTable(records: AttendanceRecord[]): void {
  const list  = document.getElementById('history-list')!;
  const empty = document.getElementById('history-empty')!;

  if (records.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const sorted = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  list.innerHTML = sorted.map(r => {
    const clockIn  = r.clockIn  ? formatTimeShort(new Date(r.clockIn.time))  : '—';
    const clockOut = r.clockOut ? formatTimeShort(new Date(r.clockOut.time)) : '—';
    const dur      = r.workDuration ? minutesToDuration(r.workDuration) : '—';
    const statusLabel = r.clockIn?.status === 'on-time' ? 'Tepat Waktu'
                      : r.clockIn?.status === 'late'    ? 'Terlambat'
                      : 'Absen';
    const statusClass = r.clockIn?.status === 'on-time' ? 'badge--success'
                      : r.clockIn?.status === 'late'    ? 'badge--warning'
                      : 'badge--error';
    const lat = r.clockIn?.gps.latitude.toFixed(5)  ?? '—';
    const lng = r.clockIn?.gps.longitude.toFixed(5) ?? '—';
    const dateFormatted = new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    return `
      <div class="history-card" data-id="${r.id}">
        <!-- Top row: date + status -->
        <div class="hcard-top">
          <span class="hcard-date">${dateFormatted}</span>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        <!-- Data row: clock in / clock out / duration / coords -->
        <div class="hcard-body">
          <div class="hcard-col">
            <span class="hcard-label">MASUK</span>
            <span class="time-chip time-chip--in">${clockIn}</span>
          </div>
          <div class="hcard-col">
            <span class="hcard-label">PULANG</span>
            <span class="time-chip time-chip--out">${clockOut}</span>
          </div>
          <div class="hcard-col">
            <span class="hcard-label">DURASI</span>
            <span class="hcard-val">${dur}</span>
          </div>
          <div class="hcard-col hcard-col--coords">
            <span class="hcard-label">LOKASI</span>
            <span class="hcard-val hcard-val--mono">${lat}, ${lng}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}


// ─── GPS Coordinates Display ──────────────────────────────────────────────────
export function renderGpsInfo(
  lat: number, lng: number, accuracy: number, altitude: number | null
): void {
  const el = document.getElementById('gps-info')!;
  el.innerHTML = `
    <div class="gps-grid">
      <div class="gps-item">
        <span class="gps-label">Latitude</span>
        <span class="gps-val">${lat.toFixed(6)}°</span>
      </div>
      <div class="gps-item">
        <span class="gps-label">Longitude</span>
        <span class="gps-val">${lng.toFixed(6)}°</span>
      </div>
      <div class="gps-item">
        <span class="gps-label">Akurasi</span>
        <span class="gps-val">±${accuracy.toFixed(1)}m</span>
      </div>
      <div class="gps-item">
        <span class="gps-label">Altitude</span>
        <span class="gps-val">${altitude !== null ? altitude.toFixed(1) + 'm' : '—'}</span>
      </div>
    </div>`;
}

// ─── Distance from Office ─────────────────────────────────────────────────────
export function renderDistanceInfo(distance: number, radius: number): void {
  const el = document.getElementById('distance-info')!;
  const inRange = distance <= radius;
  const iconOk = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const iconFar = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  el.innerHTML = `
    <div class="distance-info ${inRange ? 'distance-info--ok' : 'distance-info--far'}">
      <span class="distance-icon">${inRange ? iconOk : iconFar}</span>
      <div>
        <span class="distance-val">${distance.toFixed(0)}m dari kantor</span>
        <span class="distance-sub">${inRange ? 'Dalam radius absensi' : 'Di luar radius absensi'}</span>
      </div>
    </div>`;
}

// ─── Settings Form ────────────────────────────────────────────────────────────
export function populateSettingsForm(config: AppConfig, emp: Employee): void {
  (document.getElementById('setting-lat') as HTMLInputElement).value =
    String(config.officeLocation.latitude);
  (document.getElementById('setting-lng') as HTMLInputElement).value =
    String(config.officeLocation.longitude);
  (document.getElementById('setting-radius') as HTMLInputElement).value =
    String(config.officeLocation.radius);
  (document.getElementById('setting-office-name') as HTMLInputElement).value =
    config.officeLocation.name;
  (document.getElementById('setting-start') as HTMLInputElement).value =
    config.workStartTime;
  (document.getElementById('setting-end') as HTMLInputElement).value =
    config.workEndTime;
  (document.getElementById('setting-late') as HTMLInputElement).value =
    String(config.lateThresholdMinutes);
  (document.getElementById('setting-emp-name') as HTMLInputElement).value = emp.name;
  (document.getElementById('setting-emp-id') as HTMLInputElement).value = emp.id;
  (document.getElementById('setting-emp-pos') as HTMLInputElement).value = emp.position;
  (document.getElementById('setting-emp-dept') as HTMLInputElement).value = emp.department;
}

export function getSettingsFormValues(): { config: AppConfig; emp: Employee } {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const config: AppConfig = {
    officeLocation: {
      name: g('setting-office-name'),
      latitude: parseFloat(g('setting-lat')),
      longitude: parseFloat(g('setting-lng')),
      radius: parseInt(g('setting-radius')),
    },
    workStartTime: g('setting-start'),
    workEndTime: g('setting-end'),
    lateThresholdMinutes: parseInt(g('setting-late')),
  };
  const emp: Employee = {
    id: g('setting-emp-id'),
    name: g('setting-emp-name'),
    position: g('setting-emp-pos'),
    department: g('setting-emp-dept'),
  };
  return { config, emp };
}

// ─── Active Tab ───────────────────────────────────────────────────────────────
export function setActiveTab(tabId: string): void {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  document.getElementById(`panel-${tabId}`)?.classList.add('active');
}

// ─── Today's date label ───────────────────────────────────────────────────────
export function getTodayRecord(records: AttendanceRecord[]): AttendanceRecord | null {
  const today = getISODate();
  return records.find(r => r.date === today) ?? null;
}
