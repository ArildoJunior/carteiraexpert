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
        className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm rounded-lg px-4 py-4"
      >
        <p className="font-semibold">Senha redefinida com sucesso ✓</p>
        <p className="mt-1 text-emerald-400/80">
          Suas sessões anteriores foram encerradas por segurança.
        </p>
        <Link
          href="/login"
          className="inline-block mt-3 text-emerald-400 hover:text-emerald-300 underline text-sm"
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
          className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* Nova Senha */}
      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium text-slate-300 mb-1.5">
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
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.password && (
          <p id="reset-password-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Confirmar Nova Senha */}
      <div>
        <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-slate-300 mb-1.5">
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
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.confirmPassword && (
          <p id="reset-confirm-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="reset-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2"
      >
        {pending ? 'Redefinindo...' : 'Redefinir senha'}
      </button>
    </form>
  );
}
