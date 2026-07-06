import type { LeaveRequest, OvertimeRequest, LeaveBalance, LeaveType } from './types';
import { generateId } from './utils';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEYS = {
  LEAVES:     'absensi_leave_requests',
  OVERTIME:   'absensi_overtime_requests',
} as const;

const DEFAULT_ANNUAL_DAYS = 12;

// ─── Leave Requests ───────────────────────────────────────────────────────────
export function loadLeaveRequests(): LeaveRequest[] {
  try { return JSON.parse(localStorage.getItem(KEYS.LEAVES) ?? '[]'); }
  catch { return []; }
}

export function saveLeaveRequests(requests: LeaveRequest[]): void {
  localStorage.setItem(KEYS.LEAVES, JSON.stringify(requests));
}

/** Hitung jumlah hari kerja antara dua tanggal (eksklusif Sabtu/Minggu) */
function countWorkdays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

export function submitLeaveRequest(
  employeeId: string,
  employeeName: string,
  department: string,
  type: LeaveType,
  startDate: string,
  endDate: string,
  reason: string,
  attachment?: string,
  correctionDate?: string,
  correctionClockIn?: string,
  correctionClockOut?: string,
): LeaveRequest {
  const requests = loadLeaveRequests();
  const daysCount = type === 'koreksi' ? 1 : countWorkdays(startDate, endDate);

  const newRequest: LeaveRequest = {
    id: generateId(),
    employeeId,
    employeeName,
    department,
    type,
    startDate,
    endDate,
    reason,
    attachment,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    daysCount,
    correctionDate,
    correctionClockIn,
    correctionClockOut,
  };

  requests.unshift(newRequest);
  saveLeaveRequests(requests);
  return newRequest;
}

export function approveLeaveRequest(id: string, approverName: string): boolean {
  const requests = loadLeaveRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return false;
  requests[idx].status = 'approved';
  requests[idx].approvedBy = approverName;
  requests[idx].approvedAt = new Date().toISOString();
  saveLeaveRequests(requests);
  return true;
}

export function rejectLeaveRequest(id: string, approverName: string, rejectedReason: string): boolean {
  const requests = loadLeaveRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return false;
  requests[idx].status = 'rejected';
  requests[idx].approvedBy = approverName;
  requests[idx].approvedAt = new Date().toISOString();
  requests[idx].rejectedReason = rejectedReason;
  saveLeaveRequests(requests);
  return true;
}

export function deleteLeaveRequest(id: string): void {
  const requests = loadLeaveRequests().filter(r => r.id !== id);
  saveLeaveRequests(requests);
}

/** Saldo cuti berdasarkan permintaan yang disetujui */
export function getLeaveBalance(employeeId: string): LeaveBalance {
  const requests = loadLeaveRequests().filter(
    r => r.employeeId === employeeId && r.status === 'approved'
  );
  const currentYear = new Date().getFullYear().toString();
  const thisYear = requests.filter(r => r.startDate.startsWith(currentYear));

  return {
    employeeId,
    annualTotal: DEFAULT_ANNUAL_DAYS,
    annualUsed: thisYear.filter(r => r.type === 'cuti').reduce((s, r) => s + r.daysCount, 0),
    sickUsed:   thisYear.filter(r => r.type === 'sakit').reduce((s, r) => s + r.daysCount, 0),
    izinUsed:   thisYear.filter(r => r.type === 'izin').reduce((s, r) => s + r.daysCount, 0),
  };
}

// ─── Overtime Requests ────────────────────────────────────────────────────────
export function loadOvertimeRequests(): OvertimeRequest[] {
  try { return JSON.parse(localStorage.getItem(KEYS.OVERTIME) ?? '[]'); }
  catch { return []; }
}

export function saveOvertimeRequests(requests: OvertimeRequest[]): void {
  localStorage.setItem(KEYS.OVERTIME, JSON.stringify(requests));
}

export function submitOvertimeRequest(
  employeeId: string,
  employeeName: string,
  department: string,
  date: string,
  startTime: string,
  endTime: string,
  reason: string,
): OvertimeRequest {
  const requests = loadOvertimeRequests();
  const newReq: OvertimeRequest = {
    id: generateId(),
    employeeId,
    employeeName,
    department,
    date,
    startTime,
    endTime,
    reason,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  requests.unshift(newReq);
  saveOvertimeRequests(requests);
  return newReq;
}

export function approveOvertimeRequest(id: string, approverName: string): boolean {
  const requests = loadOvertimeRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return false;
  requests[idx].status = 'approved';
  requests[idx].approvedBy = approverName;
  requests[idx].approvedAt = new Date().toISOString();
  saveOvertimeRequests(requests);
  return true;
}

export function rejectOvertimeRequest(id: string, approverName: string, rejectedReason: string): boolean {
  const requests = loadOvertimeRequests();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return false;
  requests[idx].status = 'rejected';
  requests[idx].approvedBy = approverName;
  requests[idx].approvedAt = new Date().toISOString();
  requests[idx].rejectedReason = rejectedReason;
  saveOvertimeRequests(requests);
  return true;
}

// ─── Display Helpers ──────────────────────────────────────────────────────────
export function leaveTypeLabel(type: LeaveType): string {
  const map: Record<LeaveType, string> = {
    sakit: 'Sakit',
    izin: 'Izin',
    cuti: 'Cuti Tahunan',
    koreksi: 'Koreksi Absen',
  };
  return map[type] ?? type;
}

export function leaveTypeBadgeClass(type: LeaveType): string {
  const map: Record<LeaveType, string> = {
    sakit: 'badge-amber',
    izin: 'badge-blue',
    cuti: 'badge-green',
    koreksi: 'badge-purple',
  };
  return map[type] ?? 'badge-blue';
}

export function statusBadgeClass(status: string): string {
  return status === 'approved' ? 'badge-green'
    : status === 'rejected'   ? 'badge-red'
    : 'badge-gray';
}

export function statusLabel(status: string): string {
  return status === 'approved' ? 'Disetujui'
    : status === 'rejected'   ? 'Ditolak'
    : 'Menunggu';
}
