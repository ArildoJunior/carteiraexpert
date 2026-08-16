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
      className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-700"
    >
      Sair
    </button>
  );
}
