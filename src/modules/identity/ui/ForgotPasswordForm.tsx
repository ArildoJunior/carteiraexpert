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
        className="bg-positive-text/10 border border-positive-text/30 text-positive-text text-sm rounded-lg px-4 py-4"
      >
        <p className="font-semibold">E-mail enviado ✓</p>
        <p className="mt-1 opacity-90">
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
          className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* E-mail */}
      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-text-secondary mb-1.5">
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
          className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
        />
        {state.fieldErrors?.email && (
          <p id="forgot-email-error" className="text-negative-text text-xs mt-1">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="forgot-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-action-primary"
      >
        {pending ? 'Enviando...' : 'Enviar link de recuperação'}
      </button>
    </form>
  );
}
