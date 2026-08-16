import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../modules/identity/server/current-user';

export const metadata: Metadata = {
  title: 'CarteiraExpert — Acesso',
  description: 'Acesse ou crie sua conta no CarteiraExpert.',
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proteção server-side: se o usuário já tem sessão válida, redireciona.
  // O middleware apenas verifica a presença do cookie; aqui validamos o banco.
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">CE</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">
              CarteiraExpert
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
