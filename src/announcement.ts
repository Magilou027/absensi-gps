import type { Announcement, AnnouncementTarget } from './types';
import { generateId } from './utils';

const KEY = 'absensi_announcements';

export function loadAnnouncements(): Announcement[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

export function saveAnnouncements(items: Announcement[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function createAnnouncement(
  title: string,
  content: string,
  author: string,
  targetRole: AnnouncementTarget,
  pinned = false,
): Announcement {
  const items = loadAnnouncements();
  const item: Announcement = {
    id: generateId(),
    title,
    content,
    author,
    createdAt: new Date().toISOString(),
    targetRole,
    pinned,
  };
  // Pinned always at top
  if (pinned) items.unshift(item);
  else {
    const firstNonPinned = items.findIndex(a => !a.pinned);
    if (firstNonPinned === -1) items.push(item);
    else items.splice(firstNonPinned, 0, item);
  }
  saveAnnouncements(items);
  return item;
}

export function deleteAnnouncement(id: string): void {
  saveAnnouncements(loadAnnouncements().filter(a => a.id !== id));
}

export function togglePin(id: string): void {
  const items = loadAnnouncements();
  const idx = items.findIndex(a => a.id === id);
  if (idx === -1) return;
  items[idx].pinned = !items[idx].pinned;
  saveAnnouncements(items);
}

/** Seed pengumuman default agar tidak kosong saat pertama kali buka */
export function seedDefaultAnnouncements(): void {
  if (loadAnnouncements().length > 0) return;
  const defaults: Announcement[] = [
    {
      id: 'ann-001',
      title: '🎉 Selamat Datang di AbsensiGPS',
      content: 'Sistem absensi digital kami kini telah aktif. Gunakan fitur Clock In/Out setiap hari kerja. Untuk pengajuan izin, cuti, atau lembur — gunakan tab Pengajuan. Hubungi HR untuk pertanyaan lebih lanjut.',
      author: 'Budi Santoso (HR)',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      targetRole: 'all',
      pinned: true,
    },
    {
      id: 'ann-002',
      title: '📅 Pengingat: Kuota Cuti Tahunan',
      content: 'Setiap karyawan mendapatkan 12 hari cuti tahunan. Sisa cuti yang tidak digunakan hingga akhir tahun akan hangus. Segera rencanakan cuti Anda melalui fitur Pengajuan Cuti.',
      author: 'Budi Santoso (HR)',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      targetRole: 'employee',
      pinned: false,
    },
    {
      id: 'ann-003',
      title: '⏰ Jam Kerja Resmi',
      content: 'Jam kerja resmi: Senin–Jumat pukul 08.00–17.00 WIB. Toleransi keterlambatan 15 menit. Keterlambatan lebih dari 15 menit akan tercatat sebagai Terlambat.',
      author: 'Budi Santoso (HR)',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      targetRole: 'all',
      pinned: false,
    },
  ];
  saveAnnouncements(defaults);
}

/** Filter pengumuman yang relevan untuk role tertentu */
export function getAnnouncementsForRole(role: 'employee' | 'hr' | 'admin'): Announcement[] {
  return loadAnnouncements().filter(a =>
    a.targetRole === 'all' || a.targetRole === role
  );
}

/** Format tanggal relatif: "Hari ini", "2 hari lalu", dst */
export function relativeDate(isoDate: string): string {
  const now = Date.now();
  const diff = now - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;
  if (days < 30) return `${Math.floor(days / 7)} minggu lalu`;
  return new Date(isoDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
