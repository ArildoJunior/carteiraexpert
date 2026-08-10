# Fase 01 — Fundação Técnica

## Objetivo

Criar uma base segura, padronizada e testável antes de desenvolver regras de negócio.

## Pacote 01.01 — Estrutura e qualidade

### Incluído

- Estrutura inicial de módulos;
- TypeScript strict;
- Biome;
- Vitest;
- Playwright;
- Variáveis de ambiente;
- Convenções de erros;
- Convenções de logs;
- Alias de imports;
- CI básico, se aplicável;
- Documentação inicial.

### Fora do escopo

- Banco de dados funcional;
- Autenticação;
- Interface de produto;
- Carteira;
- Planos;
- Dados financeiros.

### Critérios de aceite

- [ ] `pnpm lint` funciona;
- [ ] `pnpm typecheck` funciona;
- [ ] `pnpm test` funciona;
- [ ] `pnpm test:e2e` possui ao menos teste de saúde;
- [ ] `pnpm build` funciona;
- [ ] Estrutura de módulos criada;
- [ ] Documentos de projeto presentes.

## Pacote 01.02 — Banco, Decimal e auditoria base

### Incluído

- PostgreSQL configurado;
- Drizzle configurado;
- Migrações;
- Biblioteca Decimal;
- Convenções de colunas financeiras;
- Estrutura inicial de audit logs;
- Estratégia de timestamps;
- Teste de conexão e migração.

### Fora do escopo

- Entidades de carteira;
- Usuários finais;
- Operações financeiras;
- Cobrança.

### Critérios de aceite

- [ ] Migração inicial executa;
- [ ] Tabela de auditoria existe;
- [ ] Decimal está centralizado;
- [ ] Não há `number` usado para valor financeiro;
- [ ] Há testes de serialização e persistência Decimal.