'use client';

import { useActionState } from 'react';
import { forgotPasswordAction, type ActionResult } from '@/app/(auth)/actions';

const initialState: ActionResult = { success: false };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.success) {
    return (
      <div
        id="forgot-success-alert"
        role="alert"
        className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm rounded-lg px-4 py-4"
      >
        <p className="font-semibold">E-mail enviado ✓</p>
        <p className="mt-1 text-emerald-400/80">
          Se este e-mail estiver cadastrado, você receberá um link em breve.
          O link expira em 15 minutos.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Erro global */}
      {state.error && (
        <div
          id="forgot-error-alert"
          role="alert"
          className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* E-mail */}
      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-300 mb-1.5">
          E-mail cadastrado
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          aria-describedby={state.fieldErrors?.email ? 'forgot-email-error' : undefined}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        {state.fieldErrors?.email && (
          <p id="forgot-email-error" className="text-red-400 text-xs mt-1">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="forgot-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2"
      >
        {pending ? 'Enviando...' : 'Enviar link de recuperação'}
      </button>
    </form>
  );
}
