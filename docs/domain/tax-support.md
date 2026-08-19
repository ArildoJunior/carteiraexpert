# Apoio Tributário

Este documento estabelece as fronteiras, limites regulatórios e o estado de implementação do apoio tributário no CarteiraExpert.

## 1. Limites Regulatórios e Vedações Permanentes

A plataforma possui finalidade estritamente informativa e organizacional:
1. **Não Emissão de DARF:** A plataforma **nunca emite DARF**, não calcula códigos de barras para recolhimento e não processa pagamentos de tributos.
2. **Não Substituição Profissional:** As informações geradas não substituem a atuação de contadores, auditores fiscais ou profissionais habilitados.
3. **Não Elaboração de Declaração Completa:** A plataforma não preenche nem transmite a Declaração de Ajuste Anual do IRPF para a Receita Federal do Brasil.

## 2. Bases Factuais Implementadas nos Motores Existentes

O suporte fiscal atual é parcial e provido diretamente pelos motores de carteira e ações corporativas:

- **Apuração de PnL Realizado por Operação de Venda (`SELL`):** O motor de posições (`src/modules/portfolio/domain/position-engine.ts`) apura deterministicamente o ganho ou perda de capital líquido confrontando o valor da venda com o custo médio ponderado da posição (*Implementado e validado*).
- **Retenção na Fonte de IRRF sobre JCP:** O motor de ações corporativas (`src/modules/corporate-actions/domain/corporate-action-engine.ts`) aplica a alíquota de 15% de imposto retido na fonte sobre o valor bruto de Juros sobre Capital Próprio (*Implementado e validado*).
- **Identificação de Proventos Isentos:** O motor distingue dividendos isentos de proventos tributáveis (*Implementado e validado*).

## 3. Módulo Tributário Dedicado e Recursos Planejados

O diretório `src/modules/tax/` encontra-se sem código ativo. As seguintes funcionalidades constituem capacidades planejadas no roadmap:

- **Módulo Fiscal Dedicado:** Consolidação mensal de resultados por classe de ativo (*Planejado, não implementado*);
- **Controle de Prejuízos Acumulados:** Compensação de perdas passadas com ganhos futuros por modalidade (*Planejado, não implementado*);
- **Relatório Anual Auxiliar para IRPF:** Informes descritivos de saldos em 31/12 e rendimentos tributáveis/isentos para apoio ao preenchimento da declaração (*Planejado, não implementado*);
- **Exportação Estruturada para Contadores:** Relatórios consolidados em formatos padronizados (*Planejado, não implementado*);
- **Regras Tributárias Versionadas:** Tabela histórica de alíquotas e isenções parametrizadas por período fiscal (*Planejado, não implementado*).

## 4. Matriz de Estado das Capacidades Tributárias

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Cálculo factual de PnL realizado por venda | Implementado | **Implementado e validado** |
| Cálculo de IRRF retido na fonte sobre JCP (15%) | Implementado | **Implementado e validado** |
| Identificação de proventos isentos (dividendos) | Implementado | **Implementado e validado** |
| Módulo dedicado de apuração mensal e fechamento fiscal | Não implementado | **Planejado, não implementado** |
| Compensação automatizada de prejuízos fiscais | Não implementado | **Planejado, não implementado** |
| Relatórios anuais auxiliares de IRPF (Bens e Direitos / Rendimentos) | Não implementado | **Planejado, não implementado** |
| Emissão de guias de recolhimento (DARF) e pagamentos | Não suportado | **Fora do escopo permanente** |
| Preenchimento / transmissão oficial de IRPF | Não suportado | **Fora do escopo permanente** |