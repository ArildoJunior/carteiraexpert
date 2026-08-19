# Módulo de Opções

Este documento define os limites de domínio e o estado de implementação das funcionalidades relacionadas ao mercado de opções no CarteiraExpert.

## 1. Limites Regulatórios e Mensagem Obrigatória

A plataforma não executa operações e não recomenda estratégias no mercado de derivativos.

> **Finalidade:** A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens.

## 2. Estado Real da Implementação

- **Catálogo Cadastral de Ativos:** O tipo `'option'` existe exclusivamente como uma das opções da coluna `assetType` na tabela de cadastro de ativos (`src/lib/db/schema/portfolio.ts`), permitindo o registro cadastral de contratos caso necessário.
- **Módulo Operacional de Opções (`src/modules/options/`):** Encontra-se vazio e **não implementado** no estado atual.

### 2.1. Funcionalidades Planejadas (Não Implementadas)
As seguintes capacidades constituem direcionamentos futuros no roadmap e não existem no código atual:
- Estruturação de posições em opções (Calls e Puts);
- Acompanhamento de strikes, prêmios pagos/recebidos e datas de vencimento;
- Monitoramento operacional de estratégias (travas, financiamento coberto, borboletas, etc.);
- Alertas descritivos de proximidade de vencimento e datas de exercício;
- Registro operacional de rolagens de contratos;
- Cálculo de gregas teóricas (Delta, Gamma, Theta, Vega, Rho).

## 3. Matriz de Estado das Capacidades de Opções

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Suporte cadastral a ativos do tipo opção (`assetType = 'option'`) | Implementado | **Implementado e validado** |
| Módulo operacional de posições em opções | Não implementado | **Planejado, não implementado** |
| Alertas de vencimento e exercício de opções | Não implementado | **Planejado, não implementado** |
| Cálculo de gregas teóricas | Não implementado | **Planejado, não implementado** |
| Registro e acompanhamento de rolagens | Não implementado | **Planejado, não implementado** |
| Recomendação de estratégias com derivativos | Não suportado | **Fora do escopo permanente** |
| Execução e envio de ordens de opções / rolagens automáticas | Não suportado | **Fora do escopo permanente** |