# Fase 05 — Planos, Entitlements e Compartilhamento

## Objetivo

Implementar controle técnico de recursos sem misturar pagamento com dados financeiros.

## Pacote 05.01 — Entitlements Free e Premium

### Incluído

- Catálogo de recursos;
- Entitlements;
- Plano Free;
- Plano Premium;
- Middleware de checagem de recurso;
- Bloqueio de funcionalidades Premium;
- Preservação de dados em downgrade.

### Fora do escopo

- Gateway de pagamento;
- Grupo compartilhado;
- Cobrança automática.

### Critérios de aceite

- [ ] Usuário Free acessa somente recursos Free;
- [ ] Usuário Premium acessa recursos habilitados;
- [ ] Downgrade preserva dados;
- [ ] Recurso Premium bloqueado não apaga informação;
- [ ] Testes de permissão existem.

## Pacote 05.02 — Grupo compartilhado e privacidade

### Incluído

- Grupo de assinatura;
- Titular pagante;
- Convites;
- Aceite de convite;
- Limite configurável de 3 a 5 membros;
- Remoção de membro;
- Rebaixamento coletivo para Free;
- Isolamento total de dados.

### Fora do escopo

- Visualização compartilhada de carteira;
- Gestão patrimonial familiar;
- Pagamento real, caso gateway não esteja pronto.

### Critérios de aceite

- [ ] Titular convida membro;
- [ ] Membro recebe entitlement Premium;
- [ ] Titular não vê dados financeiros do membro;
- [ ] Membro não vê dados do titular;
- [ ] Cancelamento remove entitlement, não dados;
- [ ] Há testes explícitos para ADR-004.