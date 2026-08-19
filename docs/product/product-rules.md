# Regras Centrais do Produto

## 1. Conceito e Finalidades de Carteira

- A carteira é a unidade patrimonial e analítica independente do usuário.
- Uma carteira não representa uma corretora nem uma conta bancária.
- A carteira deverá futuramente permitir a consolidação de ativos, saldos de caixa, eventos e posições provenientes de várias instituições ou origens de custódia. Essas capacidades ainda não estão implementadas.
- Como regra de produto, carteiras diferentes não deverão ser somadas automaticamente no dashboard padrão. No estado atual, o dashboard principal ainda agrega as carteiras ativas do usuário, conforme registrado na seção 3.

### Finalidades Aprovadas
As finalidades oficiais de carteira no produto são:
- `REAL`: carteira de patrimônio real e histórico operacional efetivo do usuário.
- `ESTUDO`: carteira hipotética para estudos, acompanhamento de teses e aprendizado.
- `ANALISE`: finalidade aprovada para simulações, modelagem de cenários e análises comparativas. A rotulagem da interface e a identificação no código e no banco ainda dependem da implementação formal das finalidades.

### Regras de Negócio e Estado da Implementação
- **Múltiplas carteiras estruturais por usuário:** *Implementado e validado no código* (o modelo e as Server Actions permitem a criação de múltiplas carteiras independentes por usuário).
- **Finalidade `REAL`:** *Regra de produto aprovada, implementação formal pendente* (o modelo atual aceita múltiplas carteiras, mas ainda não possui o atributo formal de finalidade).
- **Múltiplas carteiras `REAL` para o mesmo usuário:** *Regra de produto aprovada, ainda sem atributo formal de finalidade no código* (não há restrição a apenas uma carteira).
- **Finalidades `ESTUDO` e `ANALISE`:** *Regra de produto aprovada, implementação formal pendente* (as carteiras de estudo e análise não devem contaminar ou alterar as carteiras reais).
- **Diferenciação formal de finalidades:** o código atual não diferencia carteiras por finalidade no schema de banco de dados.

## 2. Limites de Carteiras e Política de Downgrade

### Limites por Plano (Regras Aprovadas)
- **Plano Free:** até 2 carteiras ativas no total.
- **Planos superiores ao Free e plano compartilhado, conforme as regras comerciais aprovadas:** até 10 carteiras ativas no total.
- O limite é total e global por usuário, permitindo combinação livre entre carteiras `REAL`, `ESTUDO` e `ANALISE` dentro do limite contratado.
- Não existem limites segregados por finalidade.

### Política de Downgrade e Congelamento (Regras Aprovadas)
Quando um usuário possuir mais de 2 carteiras ativas e retornar ao plano Free (por cancelamento, término de período ou encerramento de plano compartilhado):
- **Preservação total de dados:** nenhum dado histórico, evento, transação ou posição será apagado, e nenhuma carteira será destruída fisicamente.
- **Seleção de carteiras ativas:** o usuário poderá escolher até 2 carteiras para permanecerem ativas no contexto operacional.
- **Congelamento das excedentes:** as carteiras excedentes serão preservadas, ficando congeladas e disponíveis exclusivamente para consulta (somente leitura).
- **Regras das carteiras congeladas:** não aceitarão novos lançamentos, edições ou exclusões, e não participarão do contexto operacional ativo.
- **Reativação:** uma carteira congelada poderá ser reativada após novo upgrade ou após a desativação ou remoção lógica explicitamente confirmada pelo usuário, observadas as regras de retenção histórica.
- **Formulação canônica:** *"Free: até 2 carteiras ativas. Carteiras excedentes: preservadas, congeladas e somente leitura."*

### Estado da Implementação
Essas são regras de produto aprovadas. O enforcement de planos, limites quantitativos, status congelado (`frozen`), downgrade e reativação ainda não está implementado no código atual (*Regra de produto aprovada, implementação pendente*).

## 3. Dashboard e Contexto Operacional

- **Regra de produto aprovada:** o dashboard padrão deverá operar sobre uma **carteira selecionada** ou contexto selecionado, sem somar automaticamente todas as carteiras do usuário.
- **Estado atual no código:** a rota principal `/dashboard` ainda agrega e totaliza todas as carteiras ativas do usuário por moeda base (*Contradito pelo código atual*).
- **Visualização de carteira específica:** a rota `/portfolios/[id]` já opera estritamente sobre uma carteira específica (*Implementado e validado no código*).
- **Seleção de carteira no dashboard principal:** está planejada para substituir a agregação automática (*Planejado, não implementado*).
- **Carteira padrão configurável:** o usuário poderá definir qual carteira carregar inicialmente (*Planejado, não implementado*).
- **Terminologia oficial:** *carteira selecionada, contexto selecionado, dashboard da carteira, visão patrimonial da carteira, comparação explícita entre carteiras*.

## 4. Comparação entre Carteiras (Funcionalidade Planejada)

- A comparação entre carteiras é uma operação analítica explícita e sob demanda solicitada pelo usuário.
- Uma carteira `REAL` poderá ser comparada com outras carteiras `REAL`, `ESTUDO` ou `ANALISE`.
- A comparação:
  - Não cria uma nova carteira permanente;
  - Não altera patrimônio;
  - Não mistura nem funde eventos históricos;
  - Não altera saldos de caixa;
  - Não modifica posições em custódia;
  - Não transforma carteiras em uma carteira consolidada permanente.
- **Estado da implementação:** *Planejado, não implementado*. Não existem services, telas ou Server Actions de comparação entre carteiras. O modo "Mercado vs. Custo" da evolução patrimonial é uma comparação interna dentro da mesma carteira e não representa comparação entre carteiras distintas.

## 5. Saldo de Caixa (Direção Aprovada)

- A carteira contemplará controle de saldo de caixa monetário (recursos aguardando investimento, conta corrente, liquidações de vendas, aportes, retiradas e saldos por moeda).
- **Estado da implementação:** *Regra de produto aprovada, implementação pendente*. Atualmente não existem no banco ou no código: entidade de saldo de caixa, contas de liquidação/poupança, eventos de aporte/retirada/depósito/resgate, nem saldos segregados por moeda como caixa.

## 6. Custódia e Corretoras (Decisão Conceitual Aprovada)

- Corretora, custodiante e conta de origem serão tratadas conceitualmente como entidades próprias de custódia vinculadas à carteira, e não como texto livre.
- A modelagem futura permitirá múltiplas contas de custódia por carteira, consolidação de posições com detalhamento por instituição, rastreamento de origem e identificadores mascarados.
- **Estado da implementação:** *Regra de produto aprovada, implementação pendente*. Atualmente não existem tabelas de corretora/custodiante, contas de custódia ou FKs de instituição nos eventos. O campo textual `source` não representa entidade de custódia, e a estrutura interna `custodyMap` nos motores serve apenas para consolidar posições de ativos, não comprovando custódia institucional.

## 7. Análise, Screening e Valuations

- Ferramentas de análise, filtros e modelos teóricos de valuation não alteram a carteira nem afetam fatos patrimoniais.
- Projeções representam cenários hipotéticos, não promessas de resultado ou patrimônio real.
- Rankings são estritamente descritivos e refletem parâmetros definidos pelo usuário.
- O produto não recomenda compra, venda, manutenção ou troca de ativos e não fornece carteiras recomendadas.

## 8. Provedores Externos de Dados

- Quando houver integração externa, o fluxo previsto será: Provedor Externo → Adaptador Interno → Validação/Normalização → Banco Interno → Motores → Interface. No estado atual, o fluxo efetivamente validado utiliza ingestão manual e adaptadores mock; não há provedor externo real confirmado.
- **Estado da implementação:**
  - Abstração `MarketDataProviderAdapter`: *Implementado e validado no código*.
  - Adaptador manual (`ManualPayloadAdapter`): *Implementado e validado no código*.
  - Adaptador mock (`MockProviderAdapter`): *Implementado e validado no código*.
  - Ingestão interna para tabelas `market_quotes` e `exchange_rates`: *Implementado e validado no código*.
  - Integração automática com provedores externos reais: *Não implementada ou não verificada* (nenhum fornecedor exclusivo aprovado ou contratado neste momento).

## 9. Opções (Roadmap / Planejado)

- O módulo de opções está aprovado no roadmap para controle e acompanhamento operacional (compra, venda, lançamentos cobertos, exercício, vencimento, prêmios e alertas).
- **Estado da implementação:** *Planejado, não implementado*. O valor `option` existe apenas como tipo de ativo no catálogo cadastral (`ASSET_TYPES`), sem módulo operacional, cálculos de gregas, controle de exercício/vencimento ou telas dedicadas.

## 10. Apoio Tributário Informativo

- O produto prevê apoio tributário estritamente informativo e organizacional.
- **Estado da implementação:**
  - Apuração de PnL realizado por operação de venda: *Parcialmente implementado e validado* (no motor de posições).
  - Cálculo de proventos com retenção de IRRF sobre JCP e custo atribuído em bonificação: *Parcialmente implementado e validado* (no motor de ações corporativas).
  - Relatórios tributários específicos e exportações fiscais estruturadas: *Planejado ou implementação pendente*.
  - Módulo de apoio tributário completo: *Não implementado*.
- **Limites permanentes fora do escopo:** emissão de DARF, declaração completa de IRPF, aconselhamento tributário definitivo e substituição de profissional contábil habilitado.

## 11. Inteligência Artificial Editorial Interna

- O uso de IA é estritamente restrito ao fluxo editorial interno para apoio à equipe na redação de resumos e análises baseadas em documentos públicos de RI.
- A IA não calcula métricas financeiras oficiais, PnL, custo médio ou impostos.
- A IA não recomenda compra, venda ou estratégias de investimento.
- A IA não interage com usuários finais através de chats ou assistentes conversacionais.
- Conteúdo gerado com apoio de IA nunca é publicado automaticamente; revisão e aprovação humanas são obrigatórias com vínculo permanente ao documento-fonte.

## 12. Fora do Escopo Permanente da Plataforma

- Execução, roteamento ou transmissão de ordens para corretoras, bancos ou exchanges.
- Recomendação automática ou discricionária de investimentos.
- Carteiras recomendadas e relatórios de recomendação de analistas.
- Chat ou assistente conversacional de IA para o usuário final.
- Emissão de DARF ou processamento de pagamentos de tributos.
- Elaboração ou transmissão de declaração completa de IRPF.
- Substituição de contador, consultor, assessor ou analista de valores mobiliários credenciado.