'use client';

import { logoutAction } from '@/app/(auth)/actions';

export function LogoutButton() {
  const handleLogout = async () => {
    await logoutAction();
    window.location.href = '/login';
  };

  return (
    <button
      id="logout-button"
      type="button"
      onClick={handleLogout}
      className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
    >
      Sair
    </button>
  );
}
