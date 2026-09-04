import React from 'react';

export function EditorialDisclaimerBanner() {
  return (
    <div
      id="editorial-regulatory-disclaimer"
      data-testid="editorial-regulatory-disclaimer"
      className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-4 mb-6 text-amber-200"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-amber-400">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="text-sm space-y-1">
          <h4 className="font-semibold text-amber-300">
            Aviso Regulatório e Governança Editorial Interna
          </h4>
          <p className="text-amber-200/90 leading-relaxed">
            Este módulo tem finalidade <strong>estritamente interna, organizacional e educacional</strong>.
            A inteligência artificial atua exclusivamente no auxílio à redação preliminar de rascunhos, títulos e
            resumos, <strong>sem autonomia para aprovar ou publicar conteúdos</strong>.
          </p>
          <ul className="list-disc pl-5 text-xs text-amber-300/80 space-y-0.5 pt-1">
            <li>
              <strong>Revisão humana obrigatória:</strong> Nenhum conteúdo pode ser publicado sem aprovação humana prévia.
            </li>
            <li>
              <strong>Neutralidade regulatória CVM/ANBIMA:</strong> É terminantemente proibida a inclusão de promessas de rentabilidade, recomendações personalizadas de compra/venda ou garantias de retorno.
            </li>
            <li>
              <strong>Segregação de funções:</strong> O módulo editorial é isolado de dados patrimoniais e da carteira real do usuário.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
