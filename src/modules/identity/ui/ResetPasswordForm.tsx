'use client';

import { useActionState } from 'react';
import { resetPasswordAction, type ActionResult } from '@/app/(auth)/actions';
import Link from 'next/link';

const initialState: ActionResult = { success: false };

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  if (state.success) {
    return (
      <div
        id="reset-success-alert"
        role="alert"
        className="bg-positive-text/10 border border-positive-text/30 text-positive-text text-sm rounded-lg px-4 py-4"
      >
        <p className="font-semibold">Senha redefinida com sucesso ✓</p>
        <p className="mt-1 opacity-90">
          Suas sessões anteriores foram encerradas por segurança.
        </p>
        <Link
          href="/login"
          className="inline-block mt-3 text-action-primary hover:underline font-semibold text-sm"
        >
          Fazer login com a nova senha
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Token oculto */}
      <input type="hidden" name="token" value={token} />

      {/* Erro global */}
      {state.error && (
        <div
          id="reset-error-alert"
          role="alert"
          className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* Nova Senha */}
      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium text-text-secondary mb-1.5">
          Nova senha
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Mín. 8 chars, 1 maiúscula, 1 número, 1 especial"
          aria-describedby={state.fieldErrors?.password ? 'reset-password-error' : undefined}
          className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
        />
        {state.fieldErrors?.password && (
          <p id="reset-password-error" className="text-negative-text text-xs mt-1">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Confirmar Nova Senha */}
      <div>
        <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-text-secondary mb-1.5">
          Confirmar nova senha
        </label>
        <input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          aria-describedby={state.fieldErrors?.confirmPassword ? 'reset-confirm-error' : undefined}
          className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
        />
        {state.fieldErrors?.confirmPassword && (
          <p id="reset-confirm-error" className="text-negative-text text-xs mt-1">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="reset-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-action-primary"
      >
        {pending ? 'Redefinindo...' : 'Redefinir senha'}
      </button>
    </form>
  );
}
