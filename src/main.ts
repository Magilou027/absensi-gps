import 'leaflet/dist/leaflet.css';
import './style.css';
import { initAuth, getCurrentSession, login, logout } from './auth';
import { initApp } from './app';
import { initAdmin } from './admin';
import { initHR } from './hr';
import { showToast } from './ui';
import { seedDefaultAnnouncements } from './announcement';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize user db
  initAuth();
  seedDefaultAnnouncements();

  const loginContainer      = document.getElementById('login-container')!;
  const employeeContainer   = document.getElementById('employee-container')!;
  const employeeMobileNav   = document.getElementById('emp-mobile-nav')!;
  const hrContainer         = document.getElementById('hr-container')!;
  const hrMobileNav         = document.getElementById('hr-mobile-nav')!;
  const adminContainer      = document.getElementById('admin-container')!;
  const adminMobileNav      = document.getElementById('adm-mobile-nav')!;
  const loginForm           = document.getElementById('login-form') as HTMLFormElement;

  function hideAll(): void {
    loginContainer.style.display    = 'none';
    employeeContainer.style.display = 'none';
    employeeMobileNav.style.display = 'none';
    hrContainer.style.display       = 'none';
    hrMobileNav.style.display       = 'none';
    adminContainer.style.display    = 'none';
    adminMobileNav.style.display    = 'none';
  }

  function renderView(): void {
    const session = getCurrentSession();
    hideAll();

    if (!session) {
      loginContainer.style.display = 'flex';
      return;
    }

    const isMobile = window.innerWidth <= 768;

    if (session.role === 'admin') {
      adminContainer.style.display = 'grid';
      if (isMobile) adminMobileNav.style.display = 'flex';
      initAdmin(session);

    } else if (session.role === 'hr') {
      hrContainer.style.display = 'grid';
      if (isMobile) hrMobileNav.style.display = 'flex';
      initHR(session);

    } else {
      // employee
      employeeContainer.style.display = 'grid';
      if (isMobile) employeeMobileNav.style.display = 'flex';
      initApp();
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = (document.getElementById('login-username') as HTMLInputElement).value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement).value;

    const session = login(username, password);
    if (session) {
      showToast(`Selamat datang, ${session.name}!`, 'success');
      (document.getElementById('login-username') as HTMLInputElement).value = '';
      (document.getElementById('login-password') as HTMLInputElement).value = '';
      renderView();
    } else {
      showToast('Username atau password salah!', 'error');
    }
  });

  // ─── Logout handlers ─────────────────────────────────────────────────────────
  function doLogout(): void {
    logout();
    showToast('Berhasil keluar dari aplikasi', 'info');
    setTimeout(() => window.location.reload(), 1000);
  }

  // Employee sidebar logout
  document.getElementById('btn-emp-logout')?.addEventListener('click', doLogout);
  // Employee mobile nav logout
  document.getElementById('emp-mobile-logout')?.addEventListener('click', doLogout);
  // HR sidebar logout
  document.getElementById('btn-hr-logout')?.addEventListener('click', doLogout);
  // HR mobile nav logout
  document.getElementById('hr-mobile-logout')?.addEventListener('click', doLogout);
  // Admin sidebar logout
  document.getElementById('adm-logout')?.addEventListener('click', doLogout);
  // Admin mobile nav logout
  document.getElementById('adm-mobile-logout')?.addEventListener('click', doLogout);

  // ─── Responsive resize ───────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const session = getCurrentSession();
    if (!session) return;
    const isMobile = window.innerWidth <= 768;

    if (session.role === 'employee') {
      employeeMobileNav.style.display = isMobile ? 'flex' : 'none';
    } else if (session.role === 'hr') {
      hrMobileNav.style.display = isMobile ? 'flex' : 'none';
    } else if (session.role === 'admin') {
      adminMobileNav.style.display = isMobile ? 'flex' : 'none';
    }
  });

  // ─── Initial render ──────────────────────────────────────────────────────────
  renderView();
});
