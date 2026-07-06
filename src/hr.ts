import type { Session } from './auth';
import { getUsers } from './auth';
import { loadRecords, getISODate, formatTimeShort, minutesToDuration, exportToCSV } from './utils';
import { showToast } from './ui';
import {
  loadLeaveRequests, approveLeaveRequest, rejectLeaveRequest,
  loadOvertimeRequests, approveOvertimeRequest, rejectOvertimeRequest,
  leaveTypeLabel, leaveTypeBadgeClass, statusBadgeClass, statusLabel,
} from './leave';
import {
  loadAnnouncements, createAnnouncement, deleteAnnouncement, togglePin, relativeDate,
} from './announcement';

// Re-export relativeDate so it works from this module's import
export { relativeDate };

let hrSession: Session;
let approvalFilter: 'all' | 'leave' | 'overtime' | 'pending' = 'pending';

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initHR(session: Session): void {
  hrSession = session;

  // Update HR profile display
  const nameEl = document.getElementById('hr-user-name');
  if (nameEl) nameEl.textContent = session.name;

  setupHRClock();
  setupHREventListeners();
  setHRTab('overview');
}

// ─── Clock ─────────────────────────────────────────────────────────────────────
function setupHRClock(): void {
  const tick = () => {
    const now = new Date();
    const timeEl = document.getElementById('hr-live-time');
    const dateEl = document.getElementById('hr-live-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  tick();
  setInterval(tick, 1000);
}

// ─── Tab Management ───────────────────────────────────────────────────────────
function setHRTab(tabId: string): void {
  document.querySelectorAll('.hrtab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-hrtab') === tabId);
  });
  document.querySelectorAll('.hrpanel').forEach(p => {
    (p as HTMLElement).style.display = p.id === `hrpanel-${tabId}` ? 'block' : 'none';
  });

  switch (tabId) {
    case 'overview':    renderHROverview(); break;
    case 'approval':    renderApprovalList(); break;
    case 'employees':   renderHREmployees(); break;
    case 'reports':     renderHRReports(); break;
    case 'announce':    renderAnnouncementsManager(); break;
  }
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function renderHROverview(): void {
  const records = loadRecords();
  const leaves = loadLeaveRequests();
  const overtimes = loadOvertimeRequests();
  const users = getUsers().filter(u => u.role === 'employee');

  const today = getISODate();
  const todayRecords = records.filter(r => r.date === today);
  const hadirToday = todayRecords.filter(r => r.clockIn).length;
  const lateToday = todayRecords.filter(r => r.clockIn?.status === 'late').length;

  const pendingLeaves = leaves.filter(r => r.status === 'pending').length;
  const pendingOT = overtimes.filter(r => r.status === 'pending').length;
  const totalPending = pendingLeaves + pendingOT;

  // Stats cards
  const setEl = (id: string, val: string | number) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
  setEl('hr-total-emp', users.length);
  setEl('hr-hadir-today', hadirToday);
  setEl('hr-late-today', lateToday);
  setEl('hr-pending-approval', totalPending);

  // Recent requests
  const recentContainer = document.getElementById('hr-recent-requests');
  if (!recentContainer) return;

  const allRequests = [
    ...leaves.map(r => ({ ...r, kind: 'leave' as const })),
    ...overtimes.map(r => ({ ...r, kind: 'overtime' as const, type: 'lembur' as const, daysCount: 1 })),
  ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5);

  if (allRequests.length === 0) {
    recentContainer.innerHTML = '<div class="adm-empty">Belum ada pengajuan</div>';
    return;
  }

  recentContainer.innerHTML = allRequests.map(r => {
    const typeLabel = r.kind === 'overtime' ? 'Lembur' : leaveTypeLabel((r as any).type);
    return `
      <div class="activity-item">
        <div class="activity-avatar">${r.employeeName.charAt(0).toUpperCase()}</div>
        <div class="activity-info">
          <div class="activity-name">${r.employeeName}</div>
          <div class="activity-detail">${typeLabel} · ${relativeDate(r.submittedAt)}</div>
        </div>
        <span class="req-badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
    `;
  }).join('');
}

// ─── Approval ─────────────────────────────────────────────────────────────────
function renderApprovalList(): void {
  const container = document.getElementById('hr-approval-list');
  if (!container) return;

  let leaves = loadLeaveRequests();
  let overtimes = loadOvertimeRequests();

  if (approvalFilter === 'pending') {
    leaves = leaves.filter(r => r.status === 'pending');
    overtimes = overtimes.filter(r => r.status === 'pending');
  } else if (approvalFilter === 'leave') {
    overtimes = [];
  } else if (approvalFilter === 'overtime') {
    leaves = [];
  }

  const combined = [
    ...leaves.map(r => ({ kind: 'leave' as const, data: r })),
    ...overtimes.map(r => ({ kind: 'overtime' as const, data: r })),
  ].sort((a, b) => new Date(b.data.submittedAt).getTime() - new Date(a.data.submittedAt).getTime());

  if (combined.length === 0) {
    container.innerHTML = '<div class="adm-empty" style="padding:40px 16px">✅ Tidak ada pengajuan yang perlu ditindaklanjuti.</div>';
    return;
  }

  container.innerHTML = combined.map(item => {
    if (item.kind === 'leave') {
      const r = item.data;
      return `
        <div class="approval-card" id="apc-${r.id}">
          <div class="approval-card-header">
            <div class="approval-employee">
              <div class="activity-avatar" style="width:40px;height:40px;font-size:15px">${r.employeeName.charAt(0)}</div>
              <div>
                <div class="approval-emp-name">${r.employeeName}</div>
                <div class="approval-emp-dept">${r.department}</div>
              </div>
            </div>
            <span class="req-badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
          </div>
          <div class="approval-card-body">
            <div class="approval-type-row">
              <span class="req-badge ${leaveTypeBadgeClass(r.type)}">${leaveTypeLabel(r.type)}</span>
              ${r.type !== 'koreksi'
                ? `<span class="approval-dates">${r.startDate}${r.endDate !== r.startDate ? ` s.d. ${r.endDate}` : ''} · <strong>${r.daysCount} hari</strong></span>`
                : `<span class="approval-dates">Koreksi: ${r.correctionDate}</span>`
              }
            </div>
            <div class="approval-reason">"${r.reason}"</div>
            ${r.correctionClockIn || r.correctionClockOut ? `
              <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
                ${r.correctionClockIn ? `Clock In: <strong>${r.correctionClockIn}</strong>` : ''}
                ${r.correctionClockOut ? ` · Clock Out: <strong>${r.correctionClockOut}</strong>` : ''}
              </div>` : ''}
            ${r.rejectedReason ? `<div class="req-info-row req-info-row--reject" style="margin-top:8px"><span>Alasan Tolak</span><span>${r.rejectedReason}</span></div>` : ''}
            <div class="approval-meta">Diajukan ${relativeDate(r.submittedAt)}</div>
          </div>
          ${r.status === 'pending' ? `
          <div class="approval-actions">
            <button class="btn-approve" data-approve-leave="${r.id}">✓ Setujui</button>
            <button class="btn-reject" data-reject-leave="${r.id}">✕ Tolak</button>
          </div>` : r.status === 'approved'
            ? `<div class="approval-done approval-done--approved">✓ Disetujui oleh ${r.approvedBy}</div>`
            : `<div class="approval-done approval-done--rejected">✕ Ditolak oleh ${r.approvedBy}</div>`}
        </div>
      `;
    } else {
      const r = item.data;
      return `
        <div class="approval-card" id="apc-ot-${r.id}">
          <div class="approval-card-header">
            <div class="approval-employee">
              <div class="activity-avatar" style="width:40px;height:40px;font-size:15px">${r.employeeName.charAt(0)}</div>
              <div>
                <div class="approval-emp-name">${r.employeeName}</div>
                <div class="approval-emp-dept">${r.department}</div>
              </div>
            </div>
            <span class="req-badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
          </div>
          <div class="approval-card-body">
            <div class="approval-type-row">
              <span class="req-badge badge-purple">Lembur</span>
              <span class="approval-dates">${r.date} · ${r.startTime} – ${r.endTime}</span>
            </div>
            <div class="approval-reason">"${r.reason}"</div>
            ${r.rejectedReason ? `<div class="req-info-row req-info-row--reject" style="margin-top:8px"><span>Alasan Tolak</span><span>${r.rejectedReason}</span></div>` : ''}
            <div class="approval-meta">Diajukan ${relativeDate(r.submittedAt)}</div>
          </div>
          ${r.status === 'pending' ? `
          <div class="approval-actions">
            <button class="btn-approve" data-approve-ot="${r.id}">✓ Setujui</button>
            <button class="btn-reject" data-reject-ot="${r.id}">✕ Tolak</button>
          </div>` : r.status === 'approved'
            ? `<div class="approval-done approval-done--approved">✓ Disetujui oleh ${r.approvedBy}</div>`
            : `<div class="approval-done approval-done--rejected">✕ Ditolak oleh ${r.approvedBy}</div>`}
        </div>
      `;
    }
  }).join('');

  // Bind approve/reject actions
  container.querySelectorAll('[data-approve-leave]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-approve-leave')!;
      approveLeaveRequest(id, hrSession.name);
      showToast('✅ Pengajuan disetujui!', 'success');
      renderApprovalList();
      updateHRPendingBadge();
    });
  });
  container.querySelectorAll('[data-reject-leave]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reject-leave')!;
      const reason = prompt('Masukkan alasan penolakan:');
      if (reason === null) return;
      rejectLeaveRequest(id, hrSession.name, reason || 'Tidak memenuhi syarat');
      showToast('Pengajuan ditolak.', 'info');
      renderApprovalList();
      updateHRPendingBadge();
    });
  });
  container.querySelectorAll('[data-approve-ot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-approve-ot')!;
      approveOvertimeRequest(id, hrSession.name);
      showToast('✅ Lembur disetujui!', 'success');
      renderApprovalList();
      updateHRPendingBadge();
    });
  });
  container.querySelectorAll('[data-reject-ot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-reject-ot')!;
      const reason = prompt('Masukkan alasan penolakan:');
      if (reason === null) return;
      rejectOvertimeRequest(id, hrSession.name, reason || 'Tidak disetujui');
      showToast('Lembur ditolak.', 'info');
      renderApprovalList();
      updateHRPendingBadge();
    });
  });
}

function updateHRPendingBadge(): void {
  const pending = loadLeaveRequests().filter(r => r.status === 'pending').length
    + loadOvertimeRequests().filter(r => r.status === 'pending').length;
  document.querySelectorAll('.hr-pending-badge').forEach(el => {
    (el as HTMLElement).textContent = String(pending);
    (el as HTMLElement).style.display = pending > 0 ? 'inline-flex' : 'none';
  });
}

// ─── Employees ────────────────────────────────────────────────────────────────
function renderHREmployees(): void {
  const tbody = document.getElementById('hr-emp-tbody');
  if (!tbody) return;

  const users = getUsers().filter(u => u.role === 'employee');
  const records = loadRecords();
  const today = getISODate();

  tbody.innerHTML = users.map(u => {
    const todayRec = records.find(r => r.employeeId === u.employeeId && r.date === today);
    const statusBadge = todayRec?.clockIn
      ? `<span class="req-badge ${todayRec.clockIn.status === 'on-time' ? 'badge-green' : 'badge-amber'}">${todayRec.clockIn.status === 'on-time' ? 'Hadir' : 'Terlambat'}</span>`
      : '<span class="req-badge badge-gray">Belum Absen</span>';
    return `<tr>
      <td style="font-weight:600">${u.name}</td>
      <td>${u.employeeId ?? '—'}</td>
      <td>${u.department}</td>
      <td>${u.position}</td>
      <td>${statusBadge}</td>
      <td>
        ${todayRec?.clockIn ? `<small>${formatTimeShort(new Date(todayRec.clockIn.time))}</small>` : '—'}
        ${todayRec?.clockOut ? ` → <small>${formatTimeShort(new Date(todayRec.clockOut.time))}</small>` : ''}
      </td>
    </tr>`;
  }).join('');

  if (users.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Belum ada karyawan terdaftar</td></tr>';
}

// ─── Reports ──────────────────────────────────────────────────────────────────
function renderHRReports(): void {
  const select = document.getElementById('hr-report-month') as HTMLSelectElement;
  if (!select) return;

  // Populate month options
  if (select.options.length <= 1) {
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const opt = new Option(label, val);
      if (i === 0) opt.selected = true;
      select.appendChild(opt);
    }
  }
  renderHRReportTable(select.value);
}

function renderHRReportTable(month: string): void {
  const tbody = document.getElementById('hr-report-tbody');
  if (!tbody) return;

  const records = loadRecords().filter(r => r.date.startsWith(month));
  const users = getUsers().filter(u => u.role === 'employee');

  tbody.innerHTML = users.map(u => {
    const empRecords = records.filter(r => r.employeeId === u.employeeId);
    const hadir = empRecords.filter(r => r.clockIn).length;
    const ontime = empRecords.filter(r => r.clockIn?.status === 'on-time').length;
    const late = empRecords.filter(r => r.clockIn?.status === 'late').length;
    const totalMinutes = empRecords.reduce((s, r) => s + (r.workDuration ?? 0), 0);
    const avgMin = hadir > 0 ? Math.round(totalMinutes / hadir) : 0;

    return `<tr>
      <td style="font-weight:600">${u.name}</td>
      <td>${u.department}</td>
      <td style="text-align:center"><strong style="color:var(--gold-400)">${hadir}</strong></td>
      <td style="text-align:center"><span style="color:var(--emerald-400)">${ontime}</span></td>
      <td style="text-align:center"><span style="color:var(--amber-400)">${late}</span></td>
      <td>${avgMin > 0 ? minutesToDuration(avgMin) : '—'}</td>
    </tr>`;
  }).join('');

  if (users.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Tidak ada data</td></tr>';
}

// ─── Announcements ────────────────────────────────────────────────────────────
function renderAnnouncementsManager(): void {
  const container = document.getElementById('hr-announce-list');
  if (!container) return;

  const items = loadAnnouncements();
  if (items.length === 0) {
    container.innerHTML = '<div class="adm-empty">Belum ada pengumuman. Buat pengumuman baru di atas.</div>';
    return;
  }

  container.innerHTML = items.map(a => `
    <div class="announcement-manage-card ${a.pinned ? 'ann-pinned' : ''}">
      <div class="ann-manage-header">
        <div>
          ${a.pinned ? '<span class="req-badge badge-amber" style="margin-right:6px">📌 Pinned</span>' : ''}
          <span class="req-badge ${a.targetRole === 'all' ? 'badge-blue' : a.targetRole === 'hr' ? 'badge-purple' : 'badge-green'}">${a.targetRole === 'all' ? 'Semua' : a.targetRole === 'hr' ? 'HR' : 'Karyawan'}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" data-pin-ann="${a.id}" title="${a.pinned ? 'Unpin' : 'Pin'}">${a.pinned ? '📌' : '📎'}</button>
          <button class="btn-danger btn-sm" data-del-ann="${a.id}" title="Hapus">✕</button>
        </div>
      </div>
      <div class="ann-manage-title">${a.title}</div>
      <div class="ann-manage-content">${a.content}</div>
      <div class="ann-manage-meta">${a.author} · ${relativeDate(a.createdAt)}</div>
    </div>
  `).join('');

  container.querySelectorAll('[data-del-ann]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Hapus pengumuman ini?')) return;
      deleteAnnouncement(btn.getAttribute('data-del-ann')!);
      renderAnnouncementsManager();
      showToast('Pengumuman dihapus', 'info');
    });
  });

  container.querySelectorAll('[data-pin-ann]').forEach(btn => {
    btn.addEventListener('click', () => {
      togglePin(btn.getAttribute('data-pin-ann')!);
      renderAnnouncementsManager();
    });
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupHREventListeners(): void {
  // Tab buttons (sidebar + mobile)
  document.querySelectorAll('.hrtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setHRTab(btn.getAttribute('data-hrtab')!);
    });
  });

  // Approval filter
  document.querySelectorAll('.approval-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      approvalFilter = btn.getAttribute('data-filter') as any;
      document.querySelectorAll('.approval-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderApprovalList();
    });
  });

  // Report month select
  document.getElementById('hr-report-month')?.addEventListener('change', (e) => {
    renderHRReportTable((e.target as HTMLSelectElement).value);
  });

  // Report export
  document.getElementById('hr-btn-export')?.addEventListener('click', () => {
    const records = loadRecords();
    if (records.length === 0) { showToast('Tidak ada data', 'error'); return; }
    exportToCSV(records);
    showToast('Laporan berhasil diekspor!', 'success');
  });

  // Announcement form
  document.getElementById('hr-announce-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = (document.getElementById('ann-title') as HTMLInputElement).value.trim();
    const content = (document.getElementById('ann-content') as HTMLTextAreaElement).value.trim();
    const target = (document.getElementById('ann-target') as HTMLSelectElement).value as any;
    const pinned = (document.getElementById('ann-pinned') as HTMLInputElement).checked;

    if (!title || !content) { showToast('Judul dan isi tidak boleh kosong!', 'error'); return; }

    createAnnouncement(title, content, hrSession.name, target, pinned);
    (document.getElementById('hr-announce-form') as HTMLFormElement).reset();
    renderAnnouncementsManager();
    showToast('✅ Pengumuman berhasil diterbitkan!', 'success');
  });

  // Initial pending badge
  updateHRPendingBadge();
}
