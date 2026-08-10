# Visão Geral da Arquitetura

## Estilo arquitetural

Monólito modular orientado a domínio e eventos.

## Stack principal

- Next.js;
- React;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Zod;
- Decimal;
- Jobs assíncronos;
- Armazenamento privado de documentos;
- Vitest;
- Playwright;
- Biome;
- Tailwind CSS;
- Radix UI;
- Recharts para dashboards;
- Biblioteca especializada adicional para candles, quando necessário.

## Princípios

- Uma aplicação lógica inicialmente;
- Módulos internos independentes;
- Banco relacional como fonte confiável;
- Eventos como fonte de fatos patrimoniais;
- Projeções derivadas para leitura rápida;
- Jobs para tarefas demoradas;
- Cálculo separado da interface;
- Dados de mercado ingeridos e servidos internamente;
- IA apenas para uso editorial interno, com revisão humana.

## Fluxo geral

Usuário
  -> Interface Next.js
  -> Camada de aplicação
  -> Módulos de domínio
  -> PostgreSQL / armazenamento privado / jobs assíncronos
  -> Integrações externas encapsuladas por adaptadores

## Escala

O sistema deve ser stateless na camada web para permitir múltiplas instâncias.

Processamentos pesados devem ser delegados a jobs:

- importação;
- leitura de PDF;
- processamento de documentos;
- atualização de cotações;
- geração de indicadores;
- recálculo de projeções;
- envio de alertas;
- geração editorial;
- relatórios.

## Regra de evolução

Não extrair microserviços sem métrica, gargalo comprovado ou necessidade operacional real.