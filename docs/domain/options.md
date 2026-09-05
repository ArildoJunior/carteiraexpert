# Módulo de Opções

Este documento define os limites de domínio e o estado de implementação das funcionalidades relacionadas ao mercado de opções no CarteiraExpert.

## 1. Limites Regulatórios e Mensagem Obrigatória

A plataforma não executa operações e não recomenda estratégias no mercado de derivativos.

> **Finalidade:** A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens.

## 2. Estado Real da Implementação

- **Catálogo Cadastral de Ativos:** O tipo `'option'` existe no catálogo cadastral de tipos de ativos (`asset_type`) na tabela de cadastro de ativos (`assets`).
- **Módulo Operacional de Opções (`src/modules/options/`):** **Implementado e validado (Etapa 8)**.
  - Tabela dedicada `options_contracts` com chaves estrangeiras para `portfolios`, `assets` (ativo-objeto) e `custody_accounts`;
  - Motor determinístico de Black-Scholes e cálculo de sensibilidades/gregas em `Decimal` (`src/modules/options/domain/black-scholes-engine.ts`);
  - Gestão de contratos via Drizzle ORM (`src/modules/options/server/options-contracts.service.ts`);
  - Monitoramento de proximidade de vencimento e calendário oficial B3 (`src/modules/options/domain/options-calendar.ts`);
  - Página analítica e componentes visuais (`src/app/(dashboard)/options/` e `src/modules/options/ui/`);
  - Documentação completa de domínio em [docs/domain/options-and-derivatives.md](file:///c:/Projetos/carteiraexpert/docs/domain/options-and-derivatives.md).

## 3. Matriz de Estado das Capacidades de Opções

| Funcionalidade | Status Documentado Anteriormente | Status Real Confirmado no Código |
| :--- | :--- | :--- |
| Cadastro de contratos de opções | Planejado (Etapa 8) | **Implementado e validado** |
| Cálculo de gregas teóricas (Delta, Gamma, Theta, Vega, Rho) | Implementado (`black-scholes-engine.ts`) | **Implementado e validado** |
| Curvas e simulação gráfica de payoff | Implementado (`payoff-simulator.ts`) | **Implementado e validado** |
| Registro e acompanhamento operacional de rolagens | Não suportado (somente alerta) | **Fora do escopo permanente** |
| Recomendação de estratégias com derivativos | Não suportado | **Fora do escopo permanente** |
| Execução e envio de ordens de opções / rolagens automáticas | Não suportado | **Fora do escopo permanente** |
