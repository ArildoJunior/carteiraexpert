# Fase 09 — Projeções, Opções, Alertas e Apoio Tributário

## Objetivo

Oferecer ferramentas de simulação financeira, organização cadastral de opções e consolidação de dados fiscais auxiliares, com estrita observância aos limites regulatórios (sem recomendação, sem envio de ordens e sem emissão de DARF).

## Estado Atual da Fase

> **Classificação:** **Parcialmente implementada nas bases.**  
> O cálculo de PnL realizado por venda mercantil e a retenção de 15% de IRRF sobre JCP estão implementados nos motores de posição e eventos societários. Os módulos dedicados de valuation teórico, simulações, opções operacionais e apuração fiscal anual permanecem planejados.

## Pacote 09.01 — Projeções, Simulações e Modelos de Valuation

### Incluído nas Bases

- Séries temporais de custo investido e valor de mercado apurados deterministicamente;
- Registro histórico de proventos acumulados.

### Planejado

- Modelos teóricos de valuation por ativo: Preço Teto Bazin, Fórmula de Graham, Modelo de Peter Lynch e Fluxo de Caixa Descontado (DCF);
- Simulações de aportes futuros com cenários configuráveis (conservador, base, otimista);
- Projeção de fluxo de proventos com premissa explícita de reinvestimento;
- Métricas avançadas de rentabilidade ponderada pelo tempo (TWR) e pelo dinheiro (MWR);
- **Aviso Obrigatório:** Projeções e modelos teóricos são puramente informativos e não garantem rentabilidade futura.

### Critérios de Aceite

- [x] Dados históricos e de custo calculados deterministicamente pelo motor financeiro;
- [ ] Modelos teóricos Bazin/Graham/DCF implementados de forma isolada da carteira real (*Planejado*);
- [ ] Gráficos de projeção com aviso legal visível (*Planejado*).

## Pacote 09.02 — Opções e Alertas Operacionais

### Incluído nas Bases

- Tipo cadastral `'option'` suportado na tipagem de ativos.

### Planejado

- Cadastro operacional de opções de compra (call) e opções de venda (put);
- Associação obrigatória com ativo-objeto, strike, vencimento, prêmio e quantidade;
- Acompanhamento de status de opções (aberta, exercida, expirada, encerrada);
- Alertas preventivos de proximidade de vencimento;
- Cálculo descritivo de gregas fundamentais (Delta, Gamma, Theta, Vega);
- **Aviso Institucional Obrigatório:** *"A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens."*

### Fora do Escopo Permanente

- Execução ou envio de ordens para corretoras ou B3;
- Robôs automatizados de rolagem ou execução;
- Recomendações de estratégias de derivativos.

### Critérios de Aceite

- [x] Tipo de ativo `'option'` presente no enum cadastral;
- [ ] Módulo operacional de posições em opções implementado (*Planejado*);
- [ ] Alertas de vencimento disparados com idempotência (*Planejado*).

## Pacote 09.03 — Apoio Tributário e Relatórios Auxiliares

### Incluído nas Bases

- Apuração determinística de lucro/prejuízo mercantil realizado por alienação (`realizedPnL`);
- Discriminação de 15% de IRRF retido na fonte no recebimento de JCP.

### Planejado

- Módulo dedicado `src/modules/tax/`;
- Apuração mensal de ganhos líquidos e controle de limites de isenção aplicáveis;
- Controle e compensação de prejuízos acumulados por classe de ativos;
- Relatório anual consolidado de apoio para preenchimento da Declaração de Ajuste Anual do IRPF;
- Exportação estruturada para contadores.

### Fora do Escopo Permanente

- Emissão de DARF ou guia de recolhimento;
- Pagamento automático de tributos;
- Transmissão direta de declaração à Receita Federal;
- Substituição de profissional de contabilidade habilitado.

### Critérios de Aceite

- [x] PnL realizado por venda e retenção de IRRF sobre JCP calculados com precisão `Decimal`;
- [ ] Apuração mensal consolidada de lucros/prejuízos (*Planejado*);
- [ ] Relatório anual de apoio para IRPF com avisos de finalidade estritamente informativa (*Planejado*).