# Planos e Entitlements

As regras abaixo representam decisões de produto aprovadas. O enforcement técnico e comercial ainda está pendente, salvo onde houver evidência explícita de implementação.

## 1. Conceitos Fundamentais

- **Plano:** pacote comercial que define os limites e recursos disponíveis para o usuário.
- **Entitlement:** permissão técnica atômica que habilita ou restringe o acesso a um recurso da aplicação.
- **Assinatura:** vínculo financeiro e contratual associado a um plano pago.
- **Grupo Compartilhado:** conjunto de benefícios associado a uma assinatura para compartilhamento de entitlements entre contas independentes.
- **Titular Pagante:** usuário responsável pela gestão da assinatura, pagamento e administração dos convites do grupo.
- **Membro:** usuário convidado que usufrui dos benefícios concedidos pelo grupo compartilhado.

## 2. Plano Free

O Plano Free oferece a experiência central de gestão e controle patrimonial com limites adequados ao uso individual:

- **Limite de Carteiras:** até **2 carteiras ativas** no total (combinação livre entre carteiras `REAL`, `ESTUDO` e `ANALISE`). *Implementado e validado no código com enforcement server-side via assertCanCreatePortfolio.*
- **Lançamentos e Operações:** registro manual de compras, vendas e taxas operacionais (*Implementado e validado no código*).
- **Gestão Patrimonial:** cálculo determinístico de posição, custo médio ponderado e PnL realizado (*Implementado e validado no código*).
- **Eventos Corporativos e Subscrições:** processamento de splits, grupamentos, bonificações, proventos em dinheiro (dividendos e JCP) e subscrições (*Implementado e validado no código*).
- **Visão Operacional e Dashboard:**
  - Histórico de eventos e visualização de carteira específica em `/portfolios/[id]` (*Implementado e validado no código*).
  - Dashboard contextual por carteira selecionada: *regra de produto aprovada, mas ainda não implementada no dashboard principal. O dashboard atual ainda agrega carteiras ativas do usuário.*
- **Dados de Mercado:** cotações e taxas de câmbio servidas pelo banco interno a partir de ingestão com defasagem informada (*Implementado e validado no código*).
- **Visualização Gráfica:** gráficos de alocação e evolução temporal por carteira em `/portfolios/[id]` (*Implementado e validado no código*).
- **Apoio Tributário:** base factual parcialmente disponível por meio de PnL realizado, eventos de proventos e dados operacionais. Relatórios tributários específicos e exportações fiscais estruturadas são planejados ou ainda estão pendentes (*Parcialmente implementado*).
- **Governança:** preservação total de dados e regras de congelamento seguro em caso de downgrade (*Implementado e validado no código*).

## 3. Planos Superiores ao Free

Os planos superiores ao Free ampliam a capacidade analítica e operacional da plataforma:

- **Limite de Carteiras:** até **10 carteiras ativas** no total (combinação livre entre carteiras `REAL`, `ESTUDO` e `ANALISE`). *Implementado e validado no código para o plano Pro via commercial_plans e user_plans.*
- **Estrutura de Assinaturas e Eventos:** ciclo de vida em `billing_subscriptions`, eventos em `payment_events` com idempotência estrita e adaptação agnóstica de gateways (*Implementado e validado no código*).
- **Gestão Visual e Transparência Comercial:** página `/plans` com exibição de quotas, limites, status de vigência e aviso de preparação de pagamentos sem cobrança real (*Implementado e validado no código*).
- **Comparação entre Carteiras:** ferramenta analítica para comparação explícita de métricas entre carteiras (*Planejado, não implementado*).
- **Importações Avançadas:** processamento de planilhas e importação assistida de notas de corretagem em PDF com tela de conferência (*Planejado, não implementado*).
- **Projeções e Simulações:** modelagem de cenários hipotéticos sem afetar a carteira real (*Planejado, não implementado*).
- **Módulo de Opções:** controle operacional de travas, posições cobertas e alertas de vencimento (*Planejado, não implementado*).
- **Apoio Tributário Avançado:** relatórios auxiliares consolidados e exportações estruturadas para contabilidade (*Planejado, não implementado*).
- **Conteúdo Editorial:** resumos e análises fundamentadas produzidas pela equipe editorial com apoio de IA interna (*Planejado*).
- **Armazenamento Documental:** maior limite para armazenamento privado de comprovantes e documentos financeiros (*Planejado*).

## 4. Plano Compartilhado

O Plano Compartilhado permite que um titular pagante ofereça benefícios a um grupo de 3 a 5 membros:

- **Conceito de Produto:** uma assinatura unificada gerenciada pelo titular pagante que concede entitlements dos planos superiores aos membros convidados.
- **Contas Independentes:** cada membro possui sua própria conta de acesso individual, protegida e isolada.
- **Isolamento Absoluto de Dados:** o titular pagante **não visualiza, não edita e não infere** dados de carteiras, ativos, operações, saldos, documentos, estudos ou relatórios tributários dos membros.
- **Estado da Implementação:** o conceito de plano compartilhado é uma decisão de produto aprovada. A infraestrutura comercial, convites, gestão de membros, faturamento e controle automático de entitlements ainda não estão implementados no código atual (*Regra de produto aprovada, implementação pendente*).

## 5. Política de Downgrade e Inadimplência

Caso uma assinatura paga expire, seja cancelada ou o usuário deixe um grupo compartilhado, a conta retorna ao Plano Free sob as seguintes regras aprovadas:

1. **Preservação Integral de Dados:** nenhum dado histórico, evento, transação ou posição é apagado, e nenhuma carteira é destruída fisicamente.
2. **Desativação de Recursos Superiores:** entitlements específicos de planos superiores são bloqueados.
3. **Seleção de Carteiras Ativas:** o usuário poderá escolher até 2 carteiras para permanecerem em status ativo no contexto operacional.
4. **Congelamento das Carteiras Excedentes:** as carteiras excedentes (além das 2 ativas) são preservadas e passam para o status congelado (somente leitura).
   - Carteiras congeladas permanecem disponíveis para consulta de histórico e posições.
   - Carteiras congeladas não aceitam novos lançamentos, edições ou exclusões.
   - Carteiras congeladas não participam do contexto operacional ativo nem de novos cálculos de evolução.
5. **Reativação:** carteiras congeladas poderão ser reativadas caso o usuário assine novamente um plano superior ou após a desativação ou remoção lógica explicitamente confirmada pelo usuário, observadas as regras de retenção histórica.
6. **Formulação Resumida:** *"Free: até 2 carteiras ativas. Carteiras excedentes: preservadas, congeladas e somente leitura."*
7. **Estado da Implementação:** *Implementado e validado no código através do serviço applyPlanDowngradeInTransaction e sincronização de assinaturas unpaid/canceled.*

## 6. Regra Permanente de Segurança e Privacidade

A associação de um usuário a um plano ou grupo compartilhado concede estritamente entitlements de software. Ela nunca concede permissão de leitura, edição, compartilhamento ou exportação de dados entre contas de usuários distintos.