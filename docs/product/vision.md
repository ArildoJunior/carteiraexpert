# CarteiraExpert — Visão do Produto

## 1. O Produto

O **CarteiraExpert** é um SaaS brasileiro de consolidação, acompanhamento e organização patrimonial para investidores pessoas físicas.

A visão do CarteiraExpert é oferecer suporte progressivo a ativos brasileiros, internacionais, moedas e criptoativos. A cobertura efetivamente disponível deve ser consultada no estado de entrega vigente.

A plataforma permite que investidores mantenham múltiplas carteiras estruturais independentes e registrem operações manuais e eventos corporativos. A diferenciação formal entre `REAL`, `ESTUDO` e `ANALISE` permanece aprovada, mas ainda não está implementada.

## 2. Público-Alvo

- Investidores pessoas físicas com ativos negociados na B3 (ações, FIIs, BDRs, ETFs, opções);
- Investidores com patrimônio e ativos internacionais no exterior (ações, REITs, moedas);
- Usuários com criptoativos e autocustódia;
- Investidores que exigem precisão matemática em custo médio ponderado, tratamento correto de eventos societários e apoio à organização fiscal sem promessas irrealistas.

## 3. Proposta de Valor

O CarteiraExpert baseia-se em pilares inegociáveis:

1. **Confiabilidade e Determinismo:** cálculos financeiros puros utilizando `Decimal`, persistência `NUMERIC` e motor desacoplado da interface e da IA (*Implementado e validado*).
2. **Rastreabilidade e Fatos Patrimoniais:** arquitetura orientada a eventos históricos imutáveis com trilha de auditoria (*Implementado e validado*).
3. **Tratamento Rigoroso de Eventos Societários:** suporte a splits, grupamentos, bonificações, dividendos, JCP e subscrições (*Implementado e validado*).
4. **Privacidade Absoluta:** isolamento completo entre usuários, garantindo que membros de planos compartilhados não acessem dados uns dos outros (*Regra aprovada*).
5. **Autonomia Analítica do Investidor:** ferramentas informativas de filtros, simulações e valuations sem recomendações automáticas de compra ou venda.
6. **Conteúdo Editorial Responsável:** análises fundamentadas produzidas internamente com apoio de IA e revisão humana obrigatória.

## 4. Diferenciais Estratégicos e Estado da Entrega

- **Múltiplas Carteiras Estruturais:** o usuário pode manter múltiplas carteiras independentes (*Implementado e validado no código*). A segregação formal de finalidades (`REAL`, `ESTUDO`, `ANALISE`) é uma *regra aprovada com implementação pendente*.
- **Governança de Downgrade Segura:** preservação e congelamento somente-leitura de carteiras excedentes (*Regra aprovada, implementação pendente*).
- **Entidade de Custódia Segregada:** a plataforma deverá futuramente permitir detalhamento por entidade de custódia. Esse modelo ainda não está implementado (*Regra aprovada, implementação pendente*).
- **Saldo de Caixa da Carteira:** o produto prevê futuramente o controle de saldos de caixa por carteira e moeda. Essa capacidade ainda não está implementada (*Regra aprovada, implementação pendente*).
- **Comparação Explícita entre Carteiras:** capacidade de confrontar métricas de carteiras reais com hipóteses e estudos (*Planejado, não implementado*).
- **Módulo Operacional de Opções:** o módulo operacional de opções permanece planejado e não está implementado no estado atual (*Planejado*).
- **Apoio Tributário Informativo:** o produto prevê apoio tributário informativo. Atualmente existem bases factuais parciais, como PnL realizado e tratamento de eventos de proventos, mas não há módulo fiscal completo (*Parcialmente implementado*).
- **Provedores de Mercado Desacoplados:** Abstração interna de adaptadores e ingestão manual/mock: implementadas. Integrações automáticas com provedores externos reais: não implementadas ou não verificadas.

## 5. Princípios Inegociáveis e Limites da Plataforma

- **Não recomenda investimentos:** a plataforma não sugere compra, venda, manutenção, alocação ou rolagem de ativos.
- **Não executa nem transmite ordens:** a plataforma não possui integração transacional com corretoras ou exchanges para envio de ordens.
- **Não executa operações com opções:** não realiza rolagens automáticas nem estratégias com robôs.
- **Não emite DARF nem processa pagamentos:** o apoio tributário é informativo e auxiliar; a plataforma não substitui contadores nem garante conformidade fiscal automática.
- **Não oferece chat conversacional de IA ao usuário final:** a IA atua unicamente no fluxo editorial interno sob supervisão humana.
- **Isolamento de Carteiras:** a regra de negócio do produto estabelece que o dashboard deve operar sobre o contexto selecionado, sem agregação automática indevida.