# Estado Atual do Projeto

## Última atualização

2026-08-12

## Estado geral

A fundação técnica inicial do projeto foi estabelecida.

A Fase 01 (Foundation) foi inteiramente concluída com as entregas dos Pacotes 01.01 e 01.02. A infraestrutura de banco de dados, o Decimal e a auditoria base estão validados.

Nenhuma funcionalidade de domínio financeiro foi implementada até o momento.

## Stack definida

- Next.js;
- React;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Zod;
- Jobs assíncronos;
- Vitest;
- Playwright;
- Biome;
- Tailwind CSS;
- Radix UI;
- Recharts;
- Decimal para cálculos financeiros.

## ADRs aceitos

- ADR-001 — Monólito modular;
- ADR-002 — Carteira orientada a eventos;
- ADR-003 — Motor financeiro isolado;
- ADR-004 — Privacidade no plano compartilhado;
- ADR-005 — Governança de IA editorial;
- ADR-006 — Dados de mercado internos;
- ADR-007 — Importação revisável;
- ADR-008 — Adaptadores para provedores de dados.

## Em andamento

- Nenhum pacote em implementação no momento.

## Concluído

### Documentação e governança

- Definição da visão do produto;
- Definição do escopo inicial e dos não objetivos;
- Definição da arquitetura;
- Definição dos princípios de privacidade;
- Definição dos planos e entitlements;
- Definição das fases e dos pacotes de entrega;
- Definição do protocolo para uso de IA;
- Registro dos ADRs iniciais;
- Criação e versionamento da documentação do projeto.

### Pacote 01.01 — Estrutura, qualidade e testes

- Configuração da estrutura do projeto Next.js;
- Configuração da estrutura inicial de módulos em `src/modules`;
- Configuração do Biome para linting e formatação;
- Configuração do TypeScript para verificação de tipos;
- Configuração do Vitest para testes unitários;
- Configuração do Playwright para testes E2E;
- Configuração do processo de build da aplicação;
- Confirmação da presença e da estrutura da documentação do projeto.

### Pacote 01.02 — Banco, Decimal e auditoria base

- Instalação e configuração do Drizzle ORM com o driver PostgreSQL (`postgres.js`);
- Instalação e centralização do Decimal (`decimal.js`) para cálculos financeiros;
- Definição do princípio NUMERIC, com bloqueio dos tipos float/real para dados financeiros, e uso do fuso horário UTC para colunas temporais;
- Criação e execução da migration inicial com a tabela `audit_logs`;
- Implementação de helper de inserção imutável e política de sanitização com allowlist;
- Testes unitários do Decimal e do sanitizador, incluindo o tratamento de tipos e os limites de payload;
- Testes de integração de conexão e persistência de auditoria em banco de dados isolado real.

## Validações confirmadas no ambiente local

Os itens abaixo foram totalmente validados e executados com sucesso:

- [x] `pnpm run lint`
- [x] `pnpm run typecheck`
- [x] `pnpm run test` — testes unitários e mocks;
- [x] `pnpm run test:integration` — PostgreSQL real;
- [x] `pnpm run test:e2e`
- [x] `pnpm run build`

## Não iniciado

- Autenticação;
- Consentimentos e LGPD operacional;
- Carteiras;
- Operações;
- Cálculo de posição e custo médio;
- Eventos corporativos;
- Dados de mercado;
- Gráficos;
- Importações;
- Ativos internacionais e câmbio;
- Criptoativos;
- Opções e alertas;
- Apoio tributário;
- IA editorial;
- Cobrança;
- Publicação e preparação de lançamento.

## Próxima entrega

Fase 02 / Pacote 02.01 — Cadastro, login e sessão.

## Regras preservadas

- A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens.
- O titular pagante de plano compartilhado não acessa dados financeiros dos demais membros.
- Os cálculos financeiros devem usar Decimal e persistência NUMERIC.
- Os dados importados devem ser revisáveis e auditáveis.
- A IA é destinada exclusivamente ao apoio editorial interno, com revisão humana obrigatória antes da publicação.