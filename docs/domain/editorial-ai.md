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

## 3. Estado de Implementação

- **Módulo `src/modules/editorial-ai/`:** Encontra-se sem código ativo ou tabelas de banco criadas (*Planejado, não implementado*).
- **Provedores de LLM e Filas de Processamento:** Não há chaves de API de IA, modelos conectados ou filas de processamento assíncrono configuradas no backend de produção (*Planejado, não implementado*).

## 4. Matriz de Estado das Capacidades de IA

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Diretrizes de governança e fluxo editorial documentados | Documentado | **Regra aprovada, implementação pendente** |
| Infraestrutura de backend para processamento editorial de IA | Não implementado | **Planejado, não implementado** |
| Integração com provedores de IA / LLMs | Não implementado | **Planejado, não implementado** |
| Chat ou assistente conversacional de IA para o usuário final | Não suportado | **Fora do escopo permanente** |
| Publicação automática de conteúdos por IA sem revisão humana | Não suportado | **Fora do escopo permanente** |
| Utilização de IA para cálculos patrimoniais ou tributários | Não suportado | **Fora do escopo permanente** |