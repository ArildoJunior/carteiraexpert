# Fase 05 — Planos, Entitlements e Compartilhamento

## Objetivo

Implementar o modelo comercial de planos (Free e superiores), catálogo de entitlements técnicos e gestão de grupos compartilhados com preservação do isolamento estrito de dados financeiros.

## Estado Atual da Fase

> **Classificação:** **Planejada, não implementada.**  
> O diretório `src/modules/subscriptions/` encontra-se atualmente vazio. Não existem no banco de dados tabelas de planos comerciais, assinaturas SaaS, entitlements ou gateways de pagamento integrados.

*Nota de Desambiguação:* As tabelas existentes `subscription_offers`, `subscription_rights` e `subscription_exercises` tratam exclusivamente de direitos societários de renda variável (subscrição de ações) e **não possuem relação com planos comerciais SaaS**.

## Pacote 05.01 — Entitlements e Quotas por Plano

### Planejado

- Catálogo de recursos e entitlements técnicos;
- Plano Free (limite de 2 carteiras ativas) e planos superiores (até 10 carteiras);
- Middleware no servidor para validação de entitlements e limites;
- Regras de downgrade com preservação de dados e congelamento de carteiras excedentes (`status = 'frozen'`).

### Critérios de Aceite (Não Concluídos)

- [ ] Usuário Free acessa exclusivamente recursos autorizados para seu plano;
- [ ] Usuário de plano superior tem acesso aos recursos expandidos;
- [ ] Downgrade preserva integralmente os dados financeiros do usuário, sem exclusões automáticas;
- [ ] Carteiras excedentes em downgrade entram no estado `frozen` (apenas leitura);
- [ ] Testes de validação de permissões e quotas por plano implementados.

## Pacote 05.02 — Grupo Compartilhado e Isolamento (ADR-004)

### Planejado

- Gestão de grupo de assinatura com titular pagante;
- Envio e aceite de convites para membros (limite de 3 a 5 participantes);
- Desvinculação ou cancelamento de membros com rebaixamento para o plano Free;
- **Isolamento de Dados Obrigatório:** O pagamento compartilhado não concede ao titular nem aos membros acesso para visualizar, editar ou inferir dados de carteiras, ativos ou relatórios financeiros uns dos outros.

### Fora do Escopo Permanente

- Carteira compartilhada ou cotitularidade de patrimônio;
- Consolidação automática de investimentos entre membros familiares.

### Critérios de Aceite (Não Concluídos)

- [ ] Titular gerencia convites e composição do grupo;
- [ ] Membros recebem entitlements sem acesso aos dados financeiros do titular;
- [ ] Titular não visualiza dados financeiros dos membros convidados;
- [ ] Cancelamento remove os benefícios de plano sem apagar dados das carteiras;
- [ ] Testes automatizados cobrindo explicitamente o isolamento do ADR-004 implementados.