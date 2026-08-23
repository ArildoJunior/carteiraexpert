'use client';

import { useActionState } from 'react';
import { loginAction, type ActionResult } from '@/app/(auth)/actions';

const initialState: ActionResult = { success: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {/* Erro global */}
      {state.error && !state.success && (
        <div
          id="login-error-alert"
          role="alert"
          className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
        >
          {state.error}
        </div>
      )}

      {/* E-mail */}
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-text-secondary mb-1.5">
          E-mail
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          aria-describedby={state.fieldErrors?.email ? 'login-email-error' : undefined}
          className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
        />
        {state.fieldErrors?.email && (
          <p id="login-email-error" className="text-negative-text text-xs mt-1">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Senha */}
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-text-secondary mb-1.5">
          Senha
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          aria-describedby={state.fieldErrors?.password ? 'login-password-error' : undefined}
          className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
        />
        {state.fieldErrors?.password && (
          <p id="login-password-error" className="text-negative-text text-xs mt-1">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="login-submit"
        type="submit"
        disabled={pending}
        className="w-full bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text font-semibold py-2.5 rounded-lg text-sm transition-all duration-200 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-action-primary"
      >
        {pending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
