import type { AttendanceRecord } from './types';
import type { Session, AuthUser } from './auth';
import { getUsers, saveUsers, logout } from './auth';
import { loadRecords, saveRecords, getISODate, formatTimeShort, minutesToDuration, generateId, exportToCSV } from './utils';
import { showToast } from './ui';

// ─── Sample Data Generator ───────────────────────────────────────────────────
function seedSampleData(): void {
  const existing = loadRecords();
  const hasOtherEmployees = existing.some(r => r.employeeId !== 'EMP001');
  if (hasOtherEmployees) return;

  const empList = [
    { id: 'EMP001', name: 'Rhein' },
    { id: 'EMP002', name: 'Budi Santoso' },
    { id: 'EMP003', name: 'Sari Dewi' },
  ];

  const newRecords: AttendanceRecord[] = [...existing];
  const today = new Date();

  for (const emp of empList) {
    for (let daysAgo = 1; daysAgo <= 30; daysAgo++) {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends

      // 8% chance absent
      if (Math.random() < 0.08) continue;

      // Already has real records for EMP001 on this date
      const dateStr = getISODate(d);
      if (emp.id === 'EMP001' && existing.some(r => r.date === dateStr && r.employeeId === 'EMP001')) continue;

      // Clock in: 07:30–09:00
      const ciHour = 7 + Math.floor(Math.random() * 2);
      const ciMin = Math.floor(Math.random() * 60);
      const ciDate = new Date(d);
      ciDate.setHours(ciHour, ciMin, 0, 0);

      const isLate = ciHour > 8 || (ciHour === 8 && ciMin > 15);

      // Clock out: 7–9 hrs later
      const workHours = 7 + Math.floor(Math.random() * 3);
      const coDate = new Date(ciDate);
      coDate.setHours(coDate.getHours() + workHours, Math.floor(Math.random() * 60));

      const workDuration = Math.round((coDate.getTime() - ciDate.getTime()) / 60000);

      const baseGps = { latitude: -6.2088 + (Math.random() - 0.5) * 0.002, longitude: 106.8456 + (Math.random() - 0.5) * 0.002, accuracy: 8 + Math.random() * 20, altitude: null, timestamp: ciDate.getTime() };

      newRecords.push({
        id: generateId(),
        employeeId: emp.id,
        employeeName: emp.name,
        date: dateStr,
        clockIn: {
          time: ciDate.toISOString(),
          gps: baseGps,
          status: isLate ? 'late' : 'on-time',
          address: 'Jl. Jend. Sudirman, Jakarta Selatan',
        },
        clockOut: {
          time: coDate.toISOString(),
          gps: { ...baseGps, timestamp: coDate.getTime() },
          address: 'Jl. Jend. Sudirman, Jakarta Selatan',
        },
        workDuration,
      });
    }
  }

  saveRecords(newRecords);
}

function setAdminTab(tabId: string): void {
  document.querySelectorAll('.atab-btn').forEach(b => {
    if (b.getAttribute('data-atab') === tabId) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  document.querySelectorAll('.apanel').forEach(p => (p as HTMLElement).style.display = 'none');
  const panel = document.getElementById(`apanel-${tabId}`);
  if (panel) panel.style.display = 'block';
}

function formatDateID(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Render Overview ─────────────────────────────────────────────────────────
function renderAdminOverview(records: AttendanceRecord[], users: AuthUser[]): void {
  const today = getISODate();
  const todayRecords = records.filter(r => r.date === today);
  const employees = users.filter(u => u.role === 'employee');

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthRecords = records.filter(r => r.date.startsWith(thisMonth));

  const setV = (id: string, val: string | number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  setV('adm-total-emp', employees.length);
  setV('adm-hadir-today', todayRecords.filter(r => r.clockIn).length);
  setV('adm-ontime-today', todayRecords.filter(r => r.clockIn?.status === 'on-time').length);
  setV('adm-late-today', todayRecords.filter(r => r.clockIn?.status === 'late').length);
  setV('adm-month-hadir', monthRecords.filter(r => r.clockIn).length);
  setV('adm-month-late', monthRecords.filter(r => r.clockIn?.status === 'late').length);

  // Recent activity
  const recent = [...records]
    .filter(r => r.clockIn)
    .sort((a, b) => new Date(b.clockIn!.time).getTime() - new Date(a.clockIn!.time).getTime())
    .slice(0, 5);

  const actEl = document.getElementById('adm-recent-activity')!;
  actEl.innerHTML = recent.length === 0
    ? '<div class="adm-empty">Belum ada aktivitas</div>'
    : recent.map(r => `
      <div class="activity-item">
        <div class="activity-avatar">${r.employeeName[0].toUpperCase()}</div>
        <div class="activity-info">
          <span class="activity-name">${r.employeeName}</span>
          <span class="activity-detail">Clock In ${formatTimeShort(new Date(r.clockIn!.time))} — ${formatDateID(r.date)}</span>
        </div>
        <span class="badge ${r.clockIn!.status === 'on-time' ? 'badge--success' : 'badge--warning'}">
          ${r.clockIn!.status === 'on-time' ? 'Tepat' : 'Terlambat'}
        </span>
      </div>`).join('');

  // Sparkline
  renderSparkline(records);
}

// ─── Render Today's Attendance ────────────────────────────────────────────────
function renderTodayAttendance(records: AttendanceRecord[], users: AuthUser[]): void {
  const today = getISODate();
  const employees = users.filter(u => u.role === 'employee');
  const todayMap = new Map<string, AttendanceRecord>();
  records.filter(r => r.date === today).forEach(r => todayMap.set(r.employeeId, r));

  const tbody = document.getElementById('adm-today-tbody')!;

  tbody.innerHTML = employees.map(emp => {
    const rec = todayMap.get(emp.employeeId ?? '');
    const clockIn  = rec?.clockIn  ? formatTimeShort(new Date(rec.clockIn.time))  : '—';
    const clockOut = rec?.clockOut ? formatTimeShort(new Date(rec.clockOut.time)) : '—';
    const dur = rec?.workDuration ? minutesToDuration(rec.workDuration) : '—';
    const statusBadge = !rec?.clockIn
      ? '<span class="badge badge--error">Belum Absen</span>'
      : rec.clockIn.status === 'on-time'
        ? '<span class="badge badge--success">Tepat Waktu</span>'
        : '<span class="badge badge--warning">Terlambat</span>';

    return `
      <tr class="history-row">
        <td data-label="Karyawan">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(212,160,23,0.08);border:1.5px solid rgba(212,160,23,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--gold-300);flex-shrink:0;font-family:var(--font-body);letter-spacing:0.5px">
              ${emp.name[0].toUpperCase()}
            </div>
            <div style="display:flex;flex-direction:column;gap:2px">
              <strong style="color:var(--text-primary)">${emp.name}</strong>
              <span style="font-size:11px;color:var(--text-muted)">${emp.employeeId ?? '—'}</span>
            </div>
          </div>
        </td>
        <td data-label="Departemen" style="color:var(--text-secondary)">${emp.department}</td>
        <td data-label="Jabatan" style="color:var(--text-secondary)">${emp.position}</td>
        <td data-label="Clock In"><span class="time-chip time-chip--in">${clockIn}</span></td>
        <td data-label="Clock Out"><span class="time-chip time-chip--out">${clockOut}</span></td>
        <td data-label="Durasi Kerja" style="color:var(--text-secondary)">${dur}</td>
        <td data-label="Status">${statusBadge}</td>
      </tr>`;
  }).join('');
}

// ─── Render Employee Management ───────────────────────────────────────────────
function renderEmployeeList(users: AuthUser[]): void {
  const employees = users.filter(u => u.role === 'employee');
  const tbody = document.getElementById('adm-emp-tbody')!;

  tbody.innerHTML = employees.map(emp => `
    <tr class="history-row" data-uid="${emp.id}">
      <td data-label="Karyawan">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(212,160,23,0.08);border:1.5px solid rgba(212,160,23,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--gold-300);flex-shrink:0;font-family:var(--font-body);letter-spacing:0.5px">
            ${emp.name[0].toUpperCase()}
          </div>
          <strong style="color:var(--text-primary)">${emp.name}</strong>
        </div>
      </td>
      <td data-label="ID" style="font-family:var(--font-mono);font-size:12px;color:var(--gold-400)">${emp.employeeId ?? '—'}</td>
      <td data-label="Username" style="color:var(--text-secondary)">${emp.username}</td>
      <td data-label="Jabatan" style="color:var(--text-secondary)">${emp.position}</td>
      <td data-label="Departemen" style="color:var(--text-secondary)">${emp.department}</td>
      <td data-label="Aksi">
        <button class="btn-sm adm-btn-del-emp" data-uid="${emp.id}" style="color:var(--rose-400);border-color:rgba(244,63,94,0.3);display:inline-flex;align-items:center;gap:6px">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Hapus
        </button>
      </td>
    </tr>`).join('');

  // Bind delete buttons
  document.querySelectorAll('.adm-btn-del-emp').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-uid')!;
      const user = users.find(u => u.id === uid);
      if (!user) return;
      if (!confirm(`Hapus karyawan "${user.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
      const updated = users.filter(u => u.id !== uid);
      saveUsers(updated);
      renderEmployeeList(updated);
      showToast(`Karyawan ${user.name} dihapus`, 'info');
    });
  });
}

// ─── Render Add Employee Form ─────────────────────────────────────────────────
function setupAddEmployee(users: AuthUser[]): void {
  const btn = document.getElementById('adm-btn-add-emp')!;
  const form = document.getElementById('adm-add-emp-form') as HTMLElement;

  btn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('adm-form-add-emp')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
    const name = g('adm-new-name');
    const username = g('adm-new-username');
    const password = g('adm-new-password');
    const empId = g('adm-new-empid');
    const position = g('adm-new-position');
    const department = g('adm-new-dept');

    if (!name || !username || !password || !empId) {
      showToast('Lengkapi semua field yang wajib!', 'error');
      return;
    }

    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      showToast('Username sudah digunakan!', 'error');
      return;
    }

    const newUser: AuthUser = {
      id: 'emp-' + Date.now(),
      username,
      password,
      role: 'employee',
      name,
      employeeId: empId,
      position,
      department,
    };

    users.push(newUser);
    saveUsers(users);
    renderEmployeeList(users);
    form.style.display = 'none';
    (document.getElementById('adm-form-add-emp') as HTMLFormElement).reset();
    showToast(`Karyawan ${name} berhasil ditambahkan!`, 'success');
  });
}

// ─── Sparkline (7-day Attendance Trend) ──────────────────────────────────────
function renderSparkline(records: AttendanceRecord[]): void {
  const el = document.getElementById('adm-sparkline');
  if (!el) return;

  const days: { label: string; count: number; date: string }[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString('id-ID', { weekday: 'short' }).slice(0, 3);
    const count = dow === 0 || dow === 6
      ? -1 // weekend marker
      : records.filter(r => r.date === dateStr && r.clockIn).length;
    days.push({ label, count, date: dateStr });
  }

  const maxCount = Math.max(1, ...days.filter(d => d.count >= 0).map(d => d.count));

  const bars = days.map(d => {
    if (d.count < 0) {
      // weekend
      return `<div class="sparkline-bar-col">
        <div class="sparkline-bar" style="height:4px;background:rgba(255,255,255,0.06);width:100%"></div>
        <div class="sparkline-day-label" style="opacity:0.35">${d.label}</div>
      </div>`;
    }
    const heightPct = d.count === 0 ? 6 : Math.round((d.count / maxCount) * 100);
    const isToday = d.date === getISODate();
    const color = isToday
      ? 'var(--gold-400)'
      : d.count === 0
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(59,130,246,0.5)';
    return `<div class="sparkline-bar-col">
      <div class="sparkline-bar" style="height:${heightPct}%;background:${color};" title="${d.count} hadir"></div>
      <div class="sparkline-day-label" style="${isToday ? 'color:var(--gold-300);' : ''}">${d.label}</div>
    </div>`;
  }).join('');

  const workdays = days.filter(d => d.count >= 0);
  const avgHadir = workdays.length > 0
    ? (workdays.reduce((s, d) => s + d.count, 0) / workdays.length).toFixed(1)
    : '0';

  el.innerHTML = `
    <div class="sparkline-wrap">
      <div class="sparkline-label">Tren Kehadiran 7 Hari</div>
      <div class="sparkline-chart">${bars}</div>
      <div class="sparkline-total">
        <span class="sparkline-stat">Rata-rata/hari: <strong>${avgHadir}</strong></span>
        <span class="sparkline-stat" style="color:var(--gold-400);font-size:9px;font-family:var(--font-mono)">
          &#9632; Hari ini
        </span>
      </div>
    </div>`;
}

function renderMonthlyReport(records: AttendanceRecord[], users: AuthUser[]): void {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const employees = users.filter(u => u.role === 'employee');
  const monthRec = records.filter(r => r.date.startsWith(thisMonth));

  const grid = document.getElementById('adm-report-grid');
  if (!grid) return;

  grid.innerHTML = employees.map(emp => {
    const myRec = monthRec.filter(r => r.employeeId === emp.employeeId && r.clockIn);
    const hadir = myRec.length;
    const onTime = myRec.filter(r => r.clockIn?.status === 'on-time').length;
    const late = myRec.filter(r => r.clockIn?.status === 'late').length;
    const totalMin = myRec.reduce((s, r) => s + (r.workDuration ?? 0), 0);
    const avgWork = hadir > 0 ? minutesToDuration(Math.round(totalMin / hadir)) : '—';

    return `
      <div class="emp-statecard" data-emp-id="${emp.employeeId}" data-month="${thisMonth}">
        <div class="esc-header">
          <div>
            <div class="esc-name">${emp.name}</div>
            <div class="esc-dept">${emp.department} &bull; ${emp.employeeId}</div>
          </div>
          <div class="eds-avatar" style="width:36px;height:36px;font-size:16px;">
            ${emp.name.charAt(0).toUpperCase()}
          </div>
        </div>
        <div class="esc-stats">
          <span class="stat-chip stat-chip--blue">Hadir: ${hadir}</span>
          <span class="stat-chip stat-chip--green">Tepat: ${onTime}</span>
          <span class="stat-chip stat-chip--amber">Telat: ${late}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach click listeners
  grid.querySelectorAll('.emp-statecard').forEach(card => {
    card.addEventListener('click', () => {
      const empId = card.getAttribute('data-emp-id')!;
      const month = card.getAttribute('data-month')!;
      renderEmployeeDetail(empId, month, records, users);
    });
  });

  // Month label
  const label = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const el = document.getElementById('adm-report-month');
  if (el) el.textContent = label;
}

function renderEmployeeDetail(empId: string, monthPrefix: string, records: AttendanceRecord[], users: AuthUser[]): void {
  const emp = users.find(u => u.employeeId === empId);
  if (!emp) return;

  // Show panel
  document.getElementById('apanel-reports')!.style.display = 'none';
  const detailPanel = document.getElementById('apanel-employee-detail')!;
  detailPanel.style.display = 'block';

  // Set Summary
  const avatarEl = document.getElementById('adm-detail-avatar');
  if (avatarEl) avatarEl.textContent = emp.name.charAt(0).toUpperCase();
  const nameEl = document.getElementById('adm-detail-name');
  if (nameEl) nameEl.textContent = emp.name;
  const idEl = document.getElementById('adm-detail-id');
  if (idEl) idEl.textContent = emp.employeeId;
  const roleEl = document.getElementById('adm-detail-role');
  if (roleEl) roleEl.textContent = emp.department;

  // Month Display
  const [year, monthNum] = monthPrefix.split('-');
  const dateObj = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  const monthName = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
  const monthEl = document.getElementById('adm-detail-month');
  if (monthEl) monthEl.textContent = monthName;

  // Month Navigation
  const prevBtn = document.getElementById('btn-detail-prev-month')!;
  const nextBtn = document.getElementById('btn-detail-next-month')!;
  const newPrev = prevBtn.cloneNode(true);
  const newNext = nextBtn.cloneNode(true);
  prevBtn.replaceWith(newPrev);
  nextBtn.replaceWith(newNext);

  newPrev.addEventListener('click', () => {
    const prevDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
    const newMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    renderEmployeeDetail(empId, newMonth, records, users);
  });

  newNext.addEventListener('click', () => {
    const nextDate = new Date(parseInt(year), parseInt(monthNum), 1);
    const newMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    renderEmployeeDetail(empId, newMonth, records, users);
  });

  // Render Daily History
  const listEl = document.getElementById('emp-detail-history-list')!;
  const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
  
  let html = '';
  
  for (let i = 1; i <= daysInMonth; i++) {
    const dStr = String(i).padStart(2, '0');
    const fullDate = `${monthPrefix}-${dStr}`;
    const dayDateObj = new Date(parseInt(year), parseInt(monthNum) - 1, i);
    const dayName = dayDateObj.toLocaleDateString('id-ID', { weekday: 'long' }).toUpperCase();
    const formattedDateTitle = `${dayName}, ${i} ${dateObj.toLocaleDateString('id-ID', { month: 'long' }).toUpperCase()} ${year}`;
    
    // Check if weekend
    const isWeekend = dayDateObj.getDay() === 0 || dayDateObj.getDay() === 6;

    const rec = records.find(r => r.employeeId === empId && r.date === fullDate);
    
    let dhStatusClass = isWeekend ? 'dh--absen' : 'dh--absen'; // Default libur/absen
    let attendanceText = isWeekend ? 'Libur' : 'Absen';
    let timelineStatus = 'Tidak ada jam kerja';
    let timeRange = '—';
    let shiftTime = isWeekend ? '—' : '09:00 - 17:00';
    let shiftCode = isWeekend ? 'OFF' : 'Reguler';
    let locIn = '—', locOut = '—';
    let tIn = '', tOut = '';

    if (rec && rec.clockIn) {
      if (rec.clockIn.status === 'late') {
        dhStatusClass = 'dh--telat';
        attendanceText = 'Datang Telat';
      } else {
        dhStatusClass = 'dh--hadir';
        attendanceText = 'Hadir';
      }
      
      tIn = rec.clockIn.time;
      locIn = rec.clockIn.locationStr || 'Lokasi tidak diketahui';
      
      if (rec.clockOut) {
        tOut = rec.clockOut.time;
        locOut = rec.clockOut.locationStr || 'Lokasi tidak diketahui';
        timeRange = `${tIn} - ${tOut}`;
        const total = minutesToDuration(rec.workDuration || 0);
        timelineStatus = `<span class="dh-total-val" style="margin-right:8px">${total}</span> <span style="font-size:12px;color:var(--emerald-400)">Selesai</span>`;
      } else {
        timeRange = `${tIn} - Belum`;
        timelineStatus = 'Sedang bekerja';
      }
    }

    html += `
      <div class="dh-group-title">${formattedDateTitle}</div>
      <div class="daily-history-card ${dhStatusClass}">
        <div class="dh-status-bar"></div>
        <div class="dh-row">
          <div class="dh-label">Jam Kerja</div>
          <div class="dh-val">
            <span style="display:inline-block;width:14px;height:14px;background:var(--text-primary);border-radius:2px;margin-right:8px;"></span>
            ${shiftCode}
          </div>
          <div class="dh-time">${shiftTime}</div>
        </div>
        <div class="dh-row">
          <div class="dh-label">Kehadiran</div>
          <div class="dh-val">
            <span style="display:inline-block;width:14px;height:14px;border:1px solid var(--text-muted);border-radius:50%;margin-right:8px;"></span>
            ${attendanceText}
          </div>
          <div class="dh-time">${timeRange}</div>
        </div>
        
        <div class="dh-timeline">
          <div class="dh-timeline-progress" style="width: ${tOut ? '100%' : (tIn ? '50%' : '0%')}"></div>
          <div class="dh-timeline-dot start"></div>
          <div class="dh-timeline-dot end"></div>
        </div>
        <div class="dh-timeline-labels">
          <span>${tIn || (isWeekend ? '' : '09:00')}</span>
          <span>${tOut || (isWeekend ? '' : '17:00')}</span>
        </div>

        <div class="dh-row" style="align-items:flex-start">
          <div class="dh-label" style="padding-top:2px">Lokasi Masuk</div>
          <div style="flex:1">
            <div class="dh-loc">${rec && rec.clockIn ? 'Terekam' : '—'}</div>
            <div class="dh-loc-sub">${locIn}</div>
          </div>
        </div>
        <div class="dh-row" style="align-items:flex-start">
          <div class="dh-label" style="padding-top:2px">Lokasi Keluar</div>
          <div style="flex:1">
            <div class="dh-loc">${rec && rec.clockOut ? 'Terekam' : '—'}</div>
            <div class="dh-loc-sub">${locOut}</div>
          </div>
        </div>

        <div class="dh-total">
          <div class="dh-label">Total Jam</div>
          <div style="flex:1;text-align:right">
            ${timelineStatus}
          </div>
        </div>
      </div>
    `;
  }
  
  listEl.innerHTML = html;
}

// ─── Admin Export ─────────────────────────────────────────────────────────────
function adminExport(records: AttendanceRecord[]): void {
  exportToCSV(records);
}

// ─── Setup Admin Events ───────────────────────────────────────────────────────
function setupAdminEvents(records: AttendanceRecord[]): void {
  // Tab switching
  document.querySelectorAll('.atab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setAdminTab(btn.getAttribute('data-atab')!);
      const users = getUsers();
      const allRec = loadRecords();
      const tabId = btn.getAttribute('data-atab')!;
      if (tabId === 'overview')   renderAdminOverview(allRec, users);
      if (tabId === 'today')      renderTodayAttendance(allRec, users);
      if (tabId === 'employees')  { renderEmployeeList(users); }
      if (tabId === 'reports')    renderMonthlyReport(allRec, users);
    });
  });

  // Logout
  document.getElementById('adm-logout')?.addEventListener('click', () => {
    logout();
    window.location.reload();
  });
  document.getElementById('adm-mobile-logout')?.addEventListener('click', () => {
    logout();
    window.location.reload();
  });

  // Export
  document.getElementById('adm-btn-export')?.addEventListener('click', () => {
    if (records.length === 0) { showToast('Tidak ada data untuk diekspor', 'error'); return; }
    adminExport(records);
    showToast('Data berhasil diekspor!', 'success');
  });

  // Back button from detail panel
  document.getElementById('btn-back-to-reports')?.addEventListener('click', () => {
    document.getElementById('apanel-employee-detail')!.style.display = 'none';
    document.getElementById('apanel-reports')!.style.display = 'block';
  });
}

// ─── Init Admin ───────────────────────────────────────────────────────────────
export function initAdmin(session: Session): void {
  // Seed demo data
  seedSampleData();

  const allRecords = loadRecords();
  const users = getUsers();

  // Set admin name in header
  const el = document.getElementById('adm-user-name');
  if (el) el.textContent = session.name;

  // Render all panels
  renderAdminOverview(allRecords, users);
  renderTodayAttendance(allRecords, users);
  renderEmployeeList(users);
  setupAddEmployee(users);
  renderMonthlyReport(allRecords, users);

  const tick = () => {
    const now = new Date();
    const timeEl = document.getElementById('adm-live-time');
    const dateEl = document.getElementById('adm-live-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  tick();
  setInterval(tick, 1000);

  // Default tab
  setAdminTab('overview');
  setupAdminEvents(allRecords);
}
