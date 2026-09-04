import React from 'react';

export function OptionsDisclaimerBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        role="region"
        aria-label="Aviso Regulatório de Opções"
        className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-text-secondary flex items-center gap-2"
      >
        <span className="text-amber-500 font-bold" aria-hidden="true">⚠️</span>
        <span>
          <strong className="text-text-primary">Módulo Informativo:</strong> Este ambiente não recomenda estratégias, não executa ordens, não realiza rolagens automáticas e calcula gregas teóricas via modelo de Black-Scholes.
        </span>
      </div>
    );
  }

  return (
    <aside
      id="options-regulatory-disclaimer"
      role="region"
      aria-label="Aviso Regulatório e Legal de Opções"
      className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-surface to-amber-500/5 p-4 sm:p-5 shadow-sm space-y-2"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 text-sm font-black" aria-hidden="true">
          !
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-text-primary">
          Aviso Regulatório e Diretrizes Operacionais (CVM / ANBIMA)
        </h2>
      </div>

      <div className="text-xs text-text-secondary leading-relaxed space-y-1.5 pl-8.5">
        <p>
          <strong className="text-text-primary">Finalidade exclusivamente organizacional, descritiva e educacional:</strong> O CarteiraExpert organiza e alerta sobre contratos de derivativos cadastrados pelo usuário. A plataforma <strong>não recomenda compra, venda ou rolagem de ativos</strong>, não executa nem intermedia ordens junto a corretoras ou bolsas de valores, e não substitui plataformas autorizadas de negociação.
        </p>
        <p>
          <strong className="text-text-primary">Modelagem Matemática Teórica:</strong> As gregas (Delta, Gamma, Theta, Vega, Rho) e os preços teóricos são calculados pelo modelo de Black-Scholes e podem divergir significativamente dos preços reais de negociação em tela na B3 devido a distorções de liquidez, volatilidade implícita real, dividendos, custos de corretagem, emolumentos da B3 e tributação. Operações com derivativos envolvem risco elevado de perda do capital ou obrigação de liquidação física/financeira.
        </p>
      </div>
    </aside>
  );
}
