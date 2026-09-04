# IA Editorial Interna

Este documento define as regras de domínio, limites regulatórios e o estado de implementação da Inteligência Artificial editorial no CarteiraExpert.

## 1. Finalidade e Limites Regulatórios

A inteligência artificial na plataforma possui finalidade única e exclusiva de **apoio editorial interno** à equipe de conteúdo e análise.

### Vedações Permanentes Inegociáveis
1. **Sem Chat ao Usuário Final:** A plataforma não oferece chat, assistente conversacional ou consultor de investimentos baseado em IA para o usuário final.
2. **Sem Cálculos Financeiros Oficiais:** A IA é terminantemente proibida de calcular posições, custo médio, PnL, índices contábeis, tributos ou métricas financeiras oficiais da plataforma.
3. **Sem Recomendação de Investimentos:** A IA não gera recomendações de compra, venda, manutenção ou alocação de ativos.
4. **Sem Publicação Autônoma:** Todo conteúdo gerado por IA passa obrigatoriamente por revisão, edição e aprovação humana antes de qualquer publicação.

## 2. Fluxo Editorial Obrigatório

Quando implementado, o fluxo de apoio editorial deve seguir estritamente as seguintes etapas:

1. **Envio de Documento Público:** Colaborador interno autorizado submete documento público oficial de Relações com Investidores (DRE, Formulário de Referência, Comunicado ao Mercado, Relatório da Administração);
2. **Classificação Estruturada:** Identificação automática da empresa, setor e tipo documental;
3. **Seleção de Prompt Versionado:** Aplicação de template de prompt específico e auditável por contexto;
4. **Requisição Isolada:** Cada análise é executada como uma requisição independente, sem memória contextual implícita compartilhada entre análises;
5. **Geração de Rascunho:** Produção de rascunho textual com finalidade descritiva/resumo;
6. **Revisão Humana:** Leitura crítica e validação factual por colaborador humano responsável;
7. **Decisão Humana:** Aprovação ou rejeição formal do conteúdo pelo revisor;
8. **Publicação com Vínculo:** Conteúdos aprovados são publicados mantendo vínculo permanente e rastreável com o documento público de origem e exibindo aviso editorial claro.

## 3. Estado de Implementação (Etapa 10 — Implementada e Validada)

- **Módulo `src/modules/editorial/`:** Implementado com arquitetura limpa em camadas (domain, server, ui).
- **Catálogo Físico e Schema Guardian:** 4 novas tabelas versionadas criadas e validadas pela migração `0023_add_editorial_tables.sql`:
  1. `editorial_documents`: Documento mestre com título, slug, tipo, status, visibilidade, versão corrente, flags regulatórias e metadata.
  2. `editorial_versions`: Histórico imutável de versões com hash SHA-256 de integridade e registro de origem (`MANUAL`, `AI_DRAFT`, `AI_SUGGESTION`, `REVISION`).
  3. `editorial_reviews`: Registro de revisões humanas obrigatórias com decisão (`APPROVE`, `REJECT`, `REQUEST_CHANGES`), parecer do revisor e flags regulatórias.
  4. `editorial_ai_executions`: Trilha auditada de chamadas à IA com prompt sanitizado, resposta sanitizada e status.
- **Máquina de Estados e Segregação de Funções:**
  - Fluxo: `DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> PUBLISHED -> ARCHIVED`.
  - Proibição absoluta de publicação direta sem aprovação prévia.
  - Proibição de ações de IA transicionarem status para `APPROVED` ou `PUBLISHED`.
  - Proibição de autoaprovação (o autor não pode aprovar seu próprio conteúdo).
  - Justificativa textual obrigatória para solicitações de ajuste ou reprovação.
- **Guardrails Determinísticos de Governança:**
  - `BLOCKER`: Injeção de scripts HTML, promessa de rentabilidade ("lucro garantido", "sem risco"), recomendações diretas de investimento ("compre agora", "venda imediatamente"), certeza sobre movimentos de mercado ("com certeza vai subir") e alegações de emissão de DARF oficial.
  - `WARNING`: Ausência de disclaimers regulatórios CVM/ANBIMA para análises de mercado, guias tributários e derivativos.
- **Interface e Rota:** Página `/editorial` com banner regulatório permanente (`#editorial-regulatory-disclaimer`), lista com filtros, editor com assistência de IA e painel de revisão humana.

## 4. Matriz de Estado das Capacidades de IA

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Diretrizes de governança e fluxo editorial documentados | Documentado | **Implementado e validado** |
| Infraestrutura de backend e schema para governança editorial de IA | Implementado (`src/modules/editorial/server`) | **Implementado e validado** |
| Provedor de IA desacoplado com sanitização preventiva | Implementado (`MockEditorialAiProvider`) | **Implementado e validado** |
| Painel de revisão humana obrigatória e máquina de estados | Implementado (`src/modules/editorial/ui/EditorialReviewPanel.tsx`) | **Implementado e validado** |
| Chat ou assistente conversacional de IA para o usuário final | Não suportado | **Fora do escopo permanente** |
| Publicação automática de conteúdos por IA sem revisão humana | Não suportado | **Fora do escopo permanente** |
| Utilização de IA para cálculos patrimoniais ou tributários | Não suportado | **Fora do escopo permanente** |