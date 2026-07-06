import type { AppConfig, AttendanceRecord, Employee, DashboardStats, GpsCoordinates } from './types';
import {
  loadRecords, saveRecords, loadEmployee, saveEmployee,
  loadConfig, saveConfig,
  getCurrentPosition, reverseGeocode, calculateDistance,
  getISODate, getAttendanceStatus, generateId,
  formatTime, formatDate, minutesToDuration, exportToCSV,
} from './utils';
import {
  showToast, setGpsStatus, updateClock, renderEmployee,
  setAttendanceButtonState, renderTodayStatus, renderStats,
  renderHistoryTable, renderGpsInfo, renderDistanceInfo,
  populateSettingsForm, getSettingsFormValues, setActiveTab, getTodayRecord,
} from './ui';
import {
  initMap, updateUserPosition, addAttendanceMarker,
  clearAttendanceMarkers, updateOfficeLocation, resizeMap,
} from './map';
import { getCurrentSession, getUsers, saveUsers } from './auth';
import {
  loadLeaveRequests, submitLeaveRequest, deleteLeaveRequest,
  loadOvertimeRequests, submitOvertimeRequest,
  getLeaveBalance,
  leaveTypeLabel, leaveTypeBadgeClass, statusBadgeClass, statusLabel,
} from './leave';
import { seedDefaultAnnouncements, getAnnouncementsForRole, relativeDate } from './announcement';

// ─── State ────────────────────────────────────────────────────────────────────
let records: AttendanceRecord[] = [];
let employee: Employee;
let config: AppConfig;
let currentGps: GpsCoordinates | null = null;
let currentLeaveTab = 'leave'; // 'leave' | 'overtime' | 'correction'

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initApp(): void {
  records = loadRecords();

  // Sync employee with current active session
  const session = getCurrentSession();
  if (session) {
    employee = {
      id: session.employeeId || 'EMP001',
      name: session.name,
      position: 'Staff',
      department: 'Umum',
    };

    const users = getUsers();
    const activeUser = users.find(u => u.id === session.userId);
    if (activeUser) {
      employee.position = activeUser.position;
      employee.department = activeUser.department;
    }
  } else {
    employee = loadEmployee();
  }

  config = loadConfig();
  seedDefaultAnnouncements();

  renderEmployee(employee);

  const heroGreeting = document.getElementById('hero-greeting');
  if (heroGreeting) heroGreeting.textContent = `Halo, ${employee.name}!`;

  updateDashboard();
  startClock();
  initMap('map-container', config.officeLocation);
  setupEventListeners();
  startGpsWatch();

  // Restore today's map markers
  const today = getTodayRecord(records);
  if (today?.clockIn) addAttendanceMarker(today.clockIn.gps, 'in', `Clock In ${formatTime(new Date(today.clockIn.time))}`);
  if (today?.clockOut) addAttendanceMarker(today.clockOut.gps, 'out', `Clock Out ${formatTime(new Date(today.clockOut.time))}`);
  updateButtonState();

  // Render announcements on home panel
  renderHomeAnnouncements();
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function startClock(): void {
  const tick = () => updateClock(formatTime(), formatDate());
  tick();
  window.setInterval(tick, 1000);
}

// ─── GPS Watch ────────────────────────────────────────────────────────────────
function startGpsWatch(): void {
  setGpsStatus('loading', 'Mendapatkan lokasi GPS...');

  if (!navigator.geolocation) {
    setGpsStatus('error', 'GPS tidak didukung');
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      currentGps = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        timestamp: pos.timestamp,
      };
      setGpsStatus('success', 'GPS Aktif', currentGps.accuracy);
      updateUserPosition(currentGps);
      renderGpsInfo(currentGps.latitude, currentGps.longitude, currentGps.accuracy, currentGps.altitude);

      const dist = calculateDistance(
        currentGps.latitude, currentGps.longitude,
        config.officeLocation.latitude, config.officeLocation.longitude,
      );
      renderDistanceInfo(dist, config.officeLocation.radius);
    },
    (err) => setGpsStatus('error', 'GPS Error: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

// ─── Dashboard Update ─────────────────────────────────────────────────────────
function updateDashboard(): void {
  const today = getTodayRecord(records);
  renderTodayStatus(today);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthRecords = records.filter(r => r.date.startsWith(thisMonth));

  const stats: DashboardStats = {
    totalPresent: monthRecords.filter(r => r.clockIn).length,
    totalOnTime: monthRecords.filter(r => r.clockIn?.status === 'on-time').length,
    totalLate: monthRecords.filter(r => r.clockIn?.status === 'late').length,
    totalAbsent: 0,
    currentMonth: now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    averageClockIn: '—',
  };
  renderStats(stats);
  renderHistoryTable(records);
}

// ─── Button State ─────────────────────────────────────────────────────────────
function updateButtonState(): void {
  const today = getTodayRecord(records);
  setAttendanceButtonState(!!today?.clockIn, !!today?.clockOut, false);
}

// ─── Clock In ─────────────────────────────────────────────────────────────────
async function handleClockIn(): Promise<void> {
  setAttendanceButtonState(false, false, true);
  try {
    const gps = await getCurrentPosition();
    currentGps = gps;
    const address = await reverseGeocode(gps.latitude, gps.longitude);
    const now = new Date();
    const today = getISODate();
    const status = getAttendanceStatus(now, config);

    let record = getTodayRecord(records);
    if (!record) {
      record = { id: generateId(), employeeId: employee.id, employeeName: employee.name, date: today };
      records.push(record);
    }
    record.clockIn = { time: now.toISOString(), gps, address, status };

    saveRecords(records);
    updateUserPosition(gps);
    addAttendanceMarker(gps, 'in', `Clock In ${formatTime(now)}`);
    renderGpsInfo(gps.latitude, gps.longitude, gps.accuracy, gps.altitude);

    const dist = calculateDistance(gps.latitude, gps.longitude, config.officeLocation.latitude, config.officeLocation.longitude);
    renderDistanceInfo(dist, config.officeLocation.radius);

    updateDashboard();
    updateButtonState();

    const lateMin = Math.round((now.getHours() * 60 + now.getMinutes()) - 480);
    const msg = status === 'on-time'
      ? `✅ Clock In berhasil! Tepat waktu pukul ${formatTime(now)}`
      : `⚠️ Clock In berhasil. Terlambat ${lateMin} menit`;
    showToast(msg, status === 'on-time' ? 'success' : 'info');
  } catch (err: any) {
    showToast(err.message, 'error');
    updateButtonState();
  }
}

// ─── Clock Out ────────────────────────────────────────────────────────────────
async function handleClockOut(): Promise<void> {
  const today = getTodayRecord(records);
  if (!today?.clockIn) { showToast('Anda belum melakukan Clock In hari ini!', 'error'); return; }

  setAttendanceButtonState(true, false, true);
  try {
    const gps = await getCurrentPosition();
    const address = await reverseGeocode(gps.latitude, gps.longitude);
    const now = new Date();

    today.clockOut = { time: now.toISOString(), gps, address };
    today.workDuration = Math.round((now.getTime() - new Date(today.clockIn.time).getTime()) / 60000);

    saveRecords(records);
    addAttendanceMarker(gps, 'out', `Clock Out ${formatTime(now)}`);
    updateDashboard();
    updateButtonState();
    showToast(`✅ Clock Out berhasil! Durasi kerja: ${minutesToDuration(today.workDuration)}`, 'success');
  } catch (err: any) {
    showToast(err.message, 'error');
    updateButtonState();
  }
}

// ─── Announcements on Home ────────────────────────────────────────────────────
function renderHomeAnnouncements(): void {
  const container = document.getElementById('emp-announcements');
  if (!container) return;

  const items = getAnnouncementsForRole('employee');
  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px 0">Tidak ada pengumuman terbaru.</p>';
    return;
  }

  container.innerHTML = items.slice(0, 3).map(a => `
    <div class="announcement-card ${a.pinned ? 'announcement-card--pinned' : ''}">
      ${a.pinned ? '<span class="ann-pin-badge">📌 Penting</span>' : ''}
      <div class="ann-title">${a.title}</div>
      <div class="ann-content">${a.content}</div>
      <div class="ann-meta">${a.author} · ${relativeDate(a.createdAt)}</div>
    </div>
  `).join('');
}

// ─── Leave / Pengajuan Panel ──────────────────────────────────────────────────
function renderLeavePanel(): void {
  renderLeaveBalance();
  renderLeaveSubTabs();
  renderLeaveHistory();
}

function renderLeaveBalance(): void {
  const balance = getLeaveBalance(employee.id);
  const remaining = balance.annualTotal - balance.annualUsed;

  const el = document.getElementById('leave-balance-display');
  if (!el) return;
  el.innerHTML = `
    <div class="balance-card balance-card--green">
      <div class="balance-num">${remaining}</div>
      <div class="balance-label">Cuti Tersisa</div>
      <div class="balance-sub">dari ${balance.annualTotal} hari/tahun</div>
    </div>
    <div class="balance-card balance-card--amber">
      <div class="balance-num">${balance.sickUsed}</div>
      <div class="balance-label">Sakit Dipakai</div>
      <div class="balance-sub">hari tahun ini</div>
    </div>
    <div class="balance-card balance-card--blue">
      <div class="balance-num">${balance.izinUsed}</div>
      <div class="balance-label">Izin Dipakai</div>
      <div class="balance-sub">hari tahun ini</div>
    </div>
  `;
}

function renderLeaveSubTabs(): void {
  document.querySelectorAll('.leave-subtab').forEach(btn => {
    const tab = btn.getAttribute('data-leave-tab')!;
    btn.classList.toggle('active', tab === currentLeaveTab);
  });

  const leaveForm = document.getElementById('leave-form-wrapper');
  const overtimeForm = document.getElementById('overtime-form-wrapper');
  const correctionForm = document.getElementById('correction-form-wrapper');

  if (leaveForm) leaveForm.style.display = currentLeaveTab === 'leave' ? 'block' : 'none';
  if (overtimeForm) overtimeForm.style.display = currentLeaveTab === 'overtime' ? 'block' : 'none';
  if (correctionForm) correctionForm.style.display = currentLeaveTab === 'correction' ? 'block' : 'none';
}

function renderLeaveHistory(): void {
  const container = document.getElementById('leave-history-list');
  if (!container) return;

  const leaves = loadLeaveRequests().filter(r => r.employeeId === employee.id);
  const overtimes = loadOvertimeRequests().filter(r => r.employeeId === employee.id);

  // Combine & sort by date
  type Combined = { id: string; kind: 'leave' | 'overtime'; submittedAt: string; html: string };
  const items: Combined[] = [
    ...leaves.map(r => ({
      id: r.id,
      kind: 'leave' as const,
      submittedAt: r.submittedAt,
      html: `
        <div class="request-card" id="req-${r.id}">
          <div class="request-card-header">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="req-badge ${leaveTypeBadgeClass(r.type)}">${leaveTypeLabel(r.type)}</span>
              <span class="req-badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
            </div>
            ${r.status === 'pending' ? `<button class="btn-icon-sm btn-icon-delete" data-delete-leave="${r.id}" title="Batalkan">✕</button>` : ''}
          </div>
          <div class="request-card-body">
            ${r.type === 'koreksi'
              ? `<div class="req-info-row"><span>Tanggal Koreksi</span><span>${r.correctionDate ?? r.startDate}</span></div>
                 ${r.correctionClockIn ? `<div class="req-info-row"><span>Clock In Koreksi</span><span>${r.correctionClockIn}</span></div>` : ''}
                 ${r.correctionClockOut ? `<div class="req-info-row"><span>Clock Out Koreksi</span><span>${r.correctionClockOut}</span></div>` : ''}`
              : `<div class="req-info-row"><span>Tanggal</span><span>${r.startDate}${r.endDate !== r.startDate ? ` s.d. ${r.endDate}` : ''} (${r.daysCount} hari)</span></div>`
            }
            <div class="req-info-row"><span>Alasan</span><span>${r.reason}</span></div>
            ${r.rejectedReason ? `<div class="req-info-row req-info-row--reject"><span>Alasan Tolak</span><span>${r.rejectedReason}</span></div>` : ''}
            <div class="req-info-row req-info-row--meta"><span>Diajukan</span><span>${relativeDate(r.submittedAt)}</span></div>
          </div>
        </div>`,
    })),
    ...overtimes.map(r => ({
      id: r.id,
      kind: 'overtime' as const,
      submittedAt: r.submittedAt,
      html: `
        <div class="request-card" id="req-ot-${r.id}">
          <div class="request-card-header">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="req-badge badge-purple">Lembur</span>
              <span class="req-badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
            </div>
            ${r.status === 'pending' ? `<button class="btn-icon-sm btn-icon-delete" data-delete-ot="${r.id}" title="Batalkan">✕</button>` : ''}
          </div>
          <div class="request-card-body">
            <div class="req-info-row"><span>Tanggal</span><span>${r.date}</span></div>
            <div class="req-info-row"><span>Jam</span><span>${r.startTime} – ${r.endTime}</span></div>
            <div class="req-info-row"><span>Keperluan</span><span>${r.reason}</span></div>
            ${r.rejectedReason ? `<div class="req-info-row req-info-row--reject"><span>Alasan Tolak</span><span>${r.rejectedReason}</span></div>` : ''}
            <div class="req-info-row req-info-row--meta"><span>Diajukan</span><span>${relativeDate(r.submittedAt)}</span></div>
          </div>
        </div>`,
    })),
  ];

  items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  if (items.length === 0) {
    container.innerHTML = `<div class="history-empty" style="padding:32px 16px">
      <div class="history-empty__icon">📋</div>
      <div class="history-empty__text">Belum ada pengajuan</div>
    </div>`;
    return;
  }

  container.innerHTML = items.map(i => i.html).join('');

  // Attach delete handlers
  container.querySelectorAll('[data-delete-leave]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-leave')!;
      if (!confirm('Batalkan pengajuan ini?')) return;
      deleteLeaveRequest(id);
      renderLeavePanel();
      showToast('Pengajuan dibatalkan', 'info');
    });
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners(): void {
  // Tab navigation (sidebar + mobile)
  // Tab navigation: sidebar (.tab-btn) + mobile nav (.nav-item with data-tab)
  document.querySelectorAll('[data-tab]').forEach(btn => {
    // Hanya handle tombol yang ada di dalam #employee-container atau #emp-mobile-nav
    const inEmpShell = btn.closest('#employee-container') || btn.closest('#emp-mobile-nav');
    if (!inEmpShell) return;
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab')!;
      if (!tabId) return;
      setActiveTab(tabId);
      // Sync active state: sidebar buttons
      document.querySelectorAll('#employee-container [data-tab]').forEach(b => b.classList.remove('active'));
      // Sync active state: mobile nav buttons
      document.querySelectorAll('#emp-mobile-nav [data-tab]').forEach(b => b.classList.remove('active'));
      // Set active on matching buttons (both sidebar & mobile)
      document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(b => {
        if (b.closest('#employee-container') || b.closest('#emp-mobile-nav')) b.classList.add('active');
      });
      if (tabId === 'map') setTimeout(resizeMap, 100);
      if (tabId === 'history') renderHistoryTable(records);
      if (tabId === 'settings') populateSettingsForm(config, employee);
      if (tabId === 'leave') renderLeavePanel();
    });
  });

  // Clock In / Out buttons
  document.getElementById('btn-clock-in')?.addEventListener('click', handleClockIn);
  document.getElementById('btn-clock-out')?.addEventListener('click', handleClockOut);

  // Refresh GPS
  document.getElementById('btn-refresh-gps')?.addEventListener('click', async () => {
    setGpsStatus('loading', 'Memperbarui lokasi...');
    try {
      const gps = await getCurrentPosition();
      currentGps = gps;
      setGpsStatus('success', 'GPS Aktif', gps.accuracy);
      updateUserPosition(gps);
      renderGpsInfo(gps.latitude, gps.longitude, gps.accuracy, gps.altitude);
      const dist = calculateDistance(gps.latitude, gps.longitude, config.officeLocation.latitude, config.officeLocation.longitude);
      renderDistanceInfo(dist, config.officeLocation.radius);
      showToast('Lokasi GPS diperbarui!', 'success');
    } catch (err: any) {
      setGpsStatus('error', err.message);
      showToast(err.message, 'error');
    }
  });

  // Export CSV
  document.getElementById('btn-export')?.addEventListener('click', () => {
    if (records.length === 0) { showToast('Tidak ada data untuk diekspor', 'error'); return; }
    exportToCSV(records);
    showToast('Data berhasil diekspor!', 'success');
  });

  // Clear history
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    if (!confirm('Hapus semua riwayat absensi? Tindakan ini tidak dapat dibatalkan.')) return;
    records = [];
    saveRecords(records);
    clearAttendanceMarkers();
    updateDashboard();
    updateButtonState();
    showToast('Riwayat absensi dihapus', 'info');
  });

  // Settings save
  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    const { config: newConfig, emp: newEmp } = getSettingsFormValues();
    config = newConfig;
    employee = newEmp;
    saveConfig(config);
    saveEmployee(employee);

    const session = getCurrentSession();
    if (session) {
      const users = getUsers();
      const userIdx = users.findIndex(u => u.id === session.userId);
      if (userIdx !== -1) {
        users[userIdx].name = employee.name;
        users[userIdx].employeeId = employee.id;
        users[userIdx].position = employee.position;
        users[userIdx].department = employee.department;
        saveUsers(users);
        session.name = employee.name;
        session.employeeId = employee.id;
        sessionStorage.setItem('absensi_session', JSON.stringify(session));
      }
    }
    renderEmployee(employee);
    updateOfficeLocation(config.officeLocation);
    const heroGreeting = document.getElementById('hero-greeting');
    if (heroGreeting) heroGreeting.textContent = `Halo, ${employee.name}!`;
    showToast('Pengaturan disimpan!', 'success');
    setActiveTab('home');
  });

  // ─── Leave Sub-tabs ────────────────────────────────────────────────────────
  document.querySelectorAll('.leave-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLeaveTab = btn.getAttribute('data-leave-tab') ?? 'leave';
      renderLeaveSubTabs();
    });
  });

  // Leave form submit
  document.getElementById('leave-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = (document.getElementById('leave-type') as HTMLSelectElement).value as any;
    const startDate = (document.getElementById('leave-start') as HTMLInputElement).value;
    const endDate = (document.getElementById('leave-end') as HTMLInputElement).value;
    const reason = (document.getElementById('leave-reason') as HTMLTextAreaElement).value.trim();

    if (!startDate || !endDate || !reason) { showToast('Lengkapi semua field!', 'error'); return; }
    if (endDate < startDate) { showToast('Tanggal akhir tidak boleh sebelum tanggal mulai!', 'error'); return; }

    // Check cuti balance
    if (type === 'cuti') {
      const { annualTotal, annualUsed } = getLeaveBalance(employee.id);
      const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
      if (annualUsed + days > annualTotal) {
        showToast(`Saldo cuti tidak cukup! Sisa: ${annualTotal - annualUsed} hari`, 'error');
        return;
      }
    }

    submitLeaveRequest(employee.id, employee.name, employee.department, type, startDate, endDate, reason);
    (document.getElementById('leave-form') as HTMLFormElement).reset();
    renderLeavePanel();
    showToast('✅ Pengajuan berhasil dikirim! Menunggu persetujuan HR.', 'success');
  });

  // Overtime form submit
  document.getElementById('overtime-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = (document.getElementById('ot-date') as HTMLInputElement).value;
    const startTime = (document.getElementById('ot-start') as HTMLInputElement).value;
    const endTime = (document.getElementById('ot-end') as HTMLInputElement).value;
    const reason = (document.getElementById('ot-reason') as HTMLTextAreaElement).value.trim();

    if (!date || !startTime || !endTime || !reason) { showToast('Lengkapi semua field!', 'error'); return; }

    submitOvertimeRequest(employee.id, employee.name, employee.department, date, startTime, endTime, reason);
    (document.getElementById('overtime-form') as HTMLFormElement).reset();
    renderLeavePanel();
    showToast('✅ Pengajuan lembur berhasil dikirim!', 'success');
  });

  // Correction form submit
  document.getElementById('correction-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const corrDate = (document.getElementById('corr-date') as HTMLInputElement).value;
    const corrIn = (document.getElementById('corr-clock-in') as HTMLInputElement).value;
    const corrOut = (document.getElementById('corr-clock-out') as HTMLInputElement).value;
    const reason = (document.getElementById('corr-reason') as HTMLTextAreaElement).value.trim();

    if (!corrDate || !reason) { showToast('Lengkapi tanggal dan alasan!', 'error'); return; }

    submitLeaveRequest(
      employee.id, employee.name, employee.department,
      'koreksi', corrDate, corrDate, reason, undefined,
      corrDate, corrIn, corrOut,
    );
    (document.getElementById('correction-form') as HTMLFormElement).reset();
    renderLeavePanel();
    showToast('✅ Pengajuan koreksi absen berhasil dikirim!', 'success');
  });
}
