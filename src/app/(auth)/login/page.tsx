import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../modules/identity/ui/LoginForm';

export const metadata: Metadata = {
  title: 'Entrar — CarteiraExpert',
  description: 'Faça login na sua conta CarteiraExpert.',
};

export default function LoginPage() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bem-vindo de volta</h1>
        <p className="text-slate-400 text-sm mt-1">
          Acesse sua carteira de investimentos.
        </p>
      </div>

      <LoginForm />

      <div className="mt-6 text-center space-y-2">
        <Link
          href="/forgot-password"
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Esqueci minha senha
        </Link>
        <p className="text-slate-500 text-sm">
          Não tem conta?{' '}
          <Link
            href="/register"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
