import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Atualização dos Termos — CarteiraExpert',
  description: 'Atualização dos termos de uso e política de privacidade.',
};

export default function TermsAcceptanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-6">
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
