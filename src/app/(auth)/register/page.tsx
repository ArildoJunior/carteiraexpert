import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '../../../modules/identity/ui/RegisterForm';

export const metadata: Metadata = {
  title: 'Criar Conta — CarteiraExpert',
  description: 'Crie sua conta gratuita no CarteiraExpert e organize seus investimentos.',
};

export default function RegisterPage() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Criar conta</h1>
        <p className="text-slate-400 text-sm mt-1">
          Comece a organizar sua carteira de investimentos.
        </p>
      </div>

      <RegisterForm />

      <div className="mt-6 text-center">
        <p className="text-slate-500 text-sm">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
