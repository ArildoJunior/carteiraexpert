import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../../modules/identity/ui/LoginForm';

export const metadata: Metadata = {
  title: 'Entrar — CarteiraExpert',
  description: 'Faça login na sua conta CarteiraExpert.',
};

export default function LoginPage() {
  return (
    <div className="bg-surface border border-border-theme rounded-2xl p-8 shadow-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Bem-vindo de volta</h1>
        <p className="text-text-secondary text-sm mt-1">
          Acesse sua carteira de investimentos.
        </p>
      </div>

      <LoginForm />

      <div className="mt-6 text-center space-y-2">
        <div>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-action-primary hover:underline transition-all"
          >
            Esqueci minha senha
          </Link>
        </div>
        <p className="text-text-secondary text-sm">
          Não tem conta?{' '}
          <Link
            href="/register"
            className="text-action-primary font-medium hover:underline transition-all"
          >
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
