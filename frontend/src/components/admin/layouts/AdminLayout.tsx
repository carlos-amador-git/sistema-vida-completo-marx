// src/components/admin/layouts/AdminLayout.tsx
import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { ADMIN_ROLE_COLORS, ADMIN_PERMISSIONS } from '../../../types/admin';

const AdminLayout: React.FC = () => {
  const { t } = useTranslation('admin');
  const { admin, logout, hasPermission } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const navItems = [
    {
      name: t('nav.dashboard'),
      path: '/admin/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.METRICS_READ,
    },
    {
      name: t('nav.users'),
      path: '/admin/users',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.USERS_READ,
    },
    {
      name: t('nav.institutions'),
      path: '/admin/institutions',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.INSTITUTIONS_READ,
    },
    {
      name: t('nav.audit'),
      path: '/admin/audit',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.AUDIT_READ,
    },
    {
      name: t('nav.revenue'),
      path: '/admin/subscriptions',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.METRICS_READ,
    },
    {
      name: t('nav.system'),
      path: '/admin/health',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      permission: ADMIN_PERMISSIONS.HEALTH_READ,
    },
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-800 text-white transition-all duration-300 flex flex-col fixed h-full z-40`}
        aria-label={t('nav.admin_panel')}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">V</span>
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">VIDA</h1>
                <p className="text-xs text-slate-400">{t('nav.admin_panel')}</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center mx-auto">
              <span className="text-white font-bold">V</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition"
            aria-label={sidebarOpen ? t('nav.collapse_sidebar') : t('nav.expand_sidebar')}
            aria-expanded={sidebarOpen}
          >
            <svg
              className={`w-5 h-5 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto" aria-label={t('nav.admin_panel')}>
          {navItems.map((item) => {
            if (!hasPermission(item.permission)) return null;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                aria-label={!sidebarOpen ? item.name : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-slate-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">
                  {admin?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{admin?.name}</p>
                <span className={`inline-block px-2 py-0.5 rounded text-xs ${ADMIN_ROLE_COLORS[admin?.role || 'VIEWER']}`}>
                  {t(`roles.${admin?.role || 'VIEWER'}`)}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center mx-auto">
              <span className="text-white font-semibold text-lg">
                {admin?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Top bar */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 sticky top-0 z-30">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {navItems.find((item) => isActive(item.path))?.name || 'Admin'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications placeholder */}
            <button className="p-2 rounded-lg hover:bg-gray-100 relative" aria-label={t('nav.notifications')}>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
                aria-label={t('user_menu.open_menu', { name: admin?.name })}
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
              >
                <div className="w-8 h-8 bg-sky-600 rounded-full flex items-center justify-center" aria-hidden="true">
                  <span className="text-white font-semibold">
                    {admin?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
                    role="menu"
                    aria-label={t('user_menu.label')}
                  >
                    <div className="px-4 py-2 border-b border-gray-100" role="menuitem" aria-disabled="true">
                      <p className="font-medium text-gray-900">{admin?.name}</p>
                      <p className="text-sm text-gray-500">{admin?.email}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLogout();
                      }}
                      role="menuitem"
                      className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {t('user_menu.sign_out')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
