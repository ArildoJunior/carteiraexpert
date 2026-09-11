'use client';

export interface CspCapacityWarningProps {
  maxAchievableCapacity?: number | null;
  className?: string;
  errorMessage?: string;
}

export function CspCapacityWarning({
  maxAchievableCapacity,
  className = '',
  errorMessage,
}: CspCapacityWarningProps) {
  const formattedCapacity =
    typeof maxAchievableCapacity === 'number'
      ? `${(maxAchievableCapacity * 100).toFixed(1).replace('.', ',')}%`
      : null;

  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-xs text-amber-700 dark:text-amber-300 space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">
          ⚠️
        </span>
        <h4 className="font-bold text-sm text-amber-800 dark:text-amber-200">
          Inviabilidade de Alocação Plena (100%)
        </h4>
      </div>

      <p className="leading-relaxed text-text-secondary">
        {errorMessage ||
          'As restrições de concentração máxima por ativo ou setor impediram a distribuição de 100% do capital com o universo de ativos elegíveis atual.'}
      </p>

      {formattedCapacity && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-amber-500/20 text-xs font-semibold text-text-primary">
          <span>Capacidade máxima atingida com os filtros atuais:</span>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            {formattedCapacity}
          </span>
        </div>
      )}

      <div className="pt-2 border-t border-amber-500/20 space-y-1.5 text-text-muted">
        <span className="font-semibold text-text-secondary">
          Sugestões para viabilizar a otimização:
        </span>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>Aumentar o teto de peso máximo por ativo ou setor;</li>
          <li>Reduzir a exigência mínima de margem de segurança;</li>
          <li>Flexibilizar os filtros de endividamento (Dív. Líq./EBITDA ou Dív. Líq./PL);</li>
          <li>Ajustar o ROE mínimo para qualificar um universo maior de ativos.</li>
        </ul>
      </div>
    </div>
  );
}
