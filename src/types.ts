export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // ISO date YYYY-MM-DD
  clockIn?: {
    time: string; // ISO datetime
    gps: GpsCoordinates;
    address?: string;
    status: AttendanceStatus;
  };
  clockOut?: {
    time: string;
    gps: GpsCoordinates;
    address?: string;
  };
  workDuration?: number; // minutes
  notes?: string;
}

export type AttendanceStatus = 'on-time' | 'late' | 'early' | 'absent';

export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  avatar?: string;
}

export interface OfficeLocation {
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
}

export interface AppConfig {
  officeLocation: OfficeLocation;
  workStartTime: string; // "HH:MM"
  workEndTime: string;   // "HH:MM"
  lateThresholdMinutes: number;
}

export interface DashboardStats {
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalOnTime: number;
  currentMonth: string;
  averageClockIn: string;
}

// ─── Leave / Request Types ────────────────────────────────────────────────────

export type LeaveType = 'sakit' | 'izin' | 'cuti' | 'koreksi';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: LeaveType;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  reason: string;
  attachment?: string; // base64 data URL
  status: LeaveStatus;
  submittedAt: string; // ISO datetime
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  daysCount: number;
  // Khusus koreksi absen
  correctionDate?: string;
  correctionClockIn?: string;
  correctionClockOut?: string;
}

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

export interface LeaveBalance {
  employeeId: string;
  annualTotal: number;  // jatah cuti tahunan
  annualUsed: number;   // terpakai
  sickUsed: number;     // hari sakit dipakai
  izinUsed: number;     // izin dipakai (dalam hari)
}

// ─── Announcement Types ───────────────────────────────────────────────────────

export type AnnouncementTarget = 'all' | 'employee' | 'hr';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string; // ISO datetime
  targetRole: AnnouncementTarget;
  pinned?: boolean;
}
