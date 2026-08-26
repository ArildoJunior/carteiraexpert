export function PublicFooter() {
  return (
    <footer className="border-t border-border-theme bg-surface/50 mt-auto py-12 text-text-secondary text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Coluna 1: Sobre */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-action-primary flex items-center justify-center">
                <span className="text-action-primary-text font-bold text-xs">CE</span>
              </div>
              <span className="text-text-primary font-semibold text-base tracking-tight">
                CarteiraExpert
              </span>
            </div>
            <p className="text-text-muted text-xs leading-relaxed max-w-md">
              Plataforma independente de consolidação, acompanhamento patrimonial e inteligência financeira para investidores brasileiros.
            </p>
          </div>

          {/* Coluna 2: Catálogo */}
          <div>
            <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-3">
              Catálogo de Ativos
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="/acoes" className="hover:text-text-primary transition-colors">
                  Ações Brasileiras
                </a>
              </li>
              <li>
                <a href="/fiis" className="hover:text-text-primary transition-colors">
                  Fundos Imobiliários (FIIs)
                </a>
              </li>
              <li>
                <a href="/etfs" className="hover:text-text-primary transition-colors">
                  Fundos de Índice (ETFs)
                </a>
              </li>
              <li>
                <a href="/bdrs" className="hover:text-text-primary transition-colors">
                  BDRs
                </a>
              </li>
              <li>
                <a href="/ativos" className="hover:text-text-primary transition-colors">
                  Índice Geral de Ativos
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Plataforma */}
          <div>
            <h4 className="font-semibold text-text-primary text-xs uppercase tracking-wider mb-3">
              Plataforma
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="/login" className="hover:text-text-primary transition-colors">
                  Acessar Conta
                </a>
              </li>
              <li>
                <a href="/register" className="hover:text-text-primary transition-colors">
                  Criar Conta Gratuita
                </a>
              </li>
              <li>
                <a href="/terms-acceptance" className="hover:text-text-primary transition-colors">
                  Termos e Privacidade
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer Regulatório Obrigatório */}
        <div className="pt-6 border-t border-border-theme/60 text-center sm:text-left space-y-3">
          <p className="text-[11px] text-text-muted leading-relaxed">
            <strong>Aviso Legal e Regulatório:</strong> O CarteiraExpert é uma plataforma para organização, consolidação e acompanhamento patrimonial com finalidade estritamente informativa e educacional. A plataforma não realiza recomendação de investimentos, análise de valores mobiliários, intermediação de ordens ou consultoria financeira regulamentada. Cotações e dados de mercado possuem finalidade referencial e podem apresentar atrasos regulamentares.
          </p>
          <p className="text-[11px] text-text-muted">
            &copy; {new Date().getFullYear()} CarteiraExpert. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
