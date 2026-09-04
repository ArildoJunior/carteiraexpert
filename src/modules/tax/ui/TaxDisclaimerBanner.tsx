import React from 'react';

export function TaxDisclaimerBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        role="region"
        aria-label="Aviso Regulatório Fiscal"
        className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-text-secondary flex items-center gap-2"
      >
        <span className="text-amber-500 font-bold" aria-hidden="true">⚠️</span>
        <span>
          <strong className="text-text-primary">Módulo Auxiliar de IRPF:</strong> Exclusivamente informativo. O CarteiraExpert não emite DARF, não integra com a Receita Federal e não substitui profissionais habilitados.
        </span>
      </div>
    );
  }

  return (
    <aside
      id="tax-regulatory-disclaimer"
      role="region"
      aria-label="Aviso Regulatório e Legal Fiscal"
      className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-surface to-amber-500/5 p-4 sm:p-5 shadow-sm space-y-3"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 text-sm font-black"
          aria-hidden="true"
        >
          !
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-text-primary">
          Aviso Regulatório e Diretrizes Fiscais (Receita Federal do Brasil / CVM)
        </h2>
      </div>

      <div className="text-xs text-text-secondary leading-relaxed space-y-2 pl-8.5">
        <p>
          <strong className="text-text-primary">Finalidade exclusivamente auxiliar e informativa:</strong> Este módulo não substitui o cálculo oficial de um(a) contador(a) devidamente registrado(a) no CRC ou as orientações da Receita Federal do Brasil.
        </p>
        <p>
          <strong className="text-text-primary">Sem emissão fiscal ou recolhimento:</strong> O CarteiraExpert <strong>NÃO emite DARF</strong>, <strong>NÃO realiza pagamentos</strong>, <strong>NÃO integra com o e-CAC/Receita Federal</strong> e <strong>NÃO gera declaração oficial transmitida</strong>.
        </p>
        <p>
          <strong className="text-text-primary">Responsabilidade do contribuinte:</strong> O usuário é o único responsável pela veracidade, integridade e exatidão das informações declaradas ao fisco.
        </p>
        <p>
          <strong className="text-text-primary">Vigência regulatória:</strong> Regras tributárias podem mudar; os cálculos apresentados refletem as regras vigentes aplicáveis na data da apuração, cabendo ao contribuinte conferir os valores com os informes de rendimentos oficiais e a legislação aplicável.
        </p>
      </div>
    </aside>
  );
}
