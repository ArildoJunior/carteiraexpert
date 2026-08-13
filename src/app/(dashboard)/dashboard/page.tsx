import type { Metadata } from 'next';
import { getCurrentUser } from '../../../modules/identity/server/current-user';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Dashboard — CarteiraExpert',
  description: 'Visão geral da sua carteira de investimentos.',
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Olá, {user.name.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-400 mt-1">
          Bem-vindo ao CarteiraExpert. Sua plataforma de consolidação patrimonial.
        </p>
      </div>

      {/* Placeholder — conteúdo será expandido nas próximas fases */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-500 text-sm">Patrimônio Total</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
          <p className="text-slate-600 text-xs mt-1">
            Disponível nas próximas fases
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-500 text-sm">Rentabilidade</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
          <p className="text-slate-600 text-xs mt-1">
            Disponível nas próximas fases
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-500 text-sm">Ativos</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
          <p className="text-slate-600 text-xs mt-1">
            Disponível nas próximas fases
          </p>
        </div>
      </div>

      {/* Aviso informativo */}
      <div className="mt-8 bg-emerald-950/40 border border-emerald-900/50 rounded-xl p-4">
        <p className="text-emerald-300 text-sm font-medium">ℹ️ Fase 02 — Autenticação concluída</p>
        <p className="text-emerald-500/80 text-xs mt-1">
          Cadastro, login e sessão estão ativos. O conteúdo patrimonial será
          disponibilizado nas próximas fases do produto.
        </p>
      </div>
    </div>
  );
}
