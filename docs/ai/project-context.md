# CarteiraExpert — Contexto Permanente para IA

## Natureza deste Diretório

Os documentos presentes em `docs/ai/` constituem, no estado atual do projeto, **protocolos de trabalho, regras operacionais e templates para assistência de engenharia**, além de registrar as **diretrizes de governança para a futura IA editorial interna**. A existência destes arquivos não representa código de IA em execução nem integrações ativas no produto.

## Produto

O CarteiraExpert é um SaaS brasileiro de consolidação patrimonial para ativos brasileiros, internacionais, moedas e criptoativos.

A plataforma organiza carteiras, operações, eventos corporativos, projeções, opções, informações tributárias de apoio, dados de mercado e conteúdo editorial.

## Limites Obrigatórios e Vedações Permanentes

- Não recomenda compra, venda, manutenção, rolagem ou alocação de ativos;
- Não executa nem transmite ordens para corretoras, bancos ou exchanges;
- Não emite DARF nem efetua pagamentos de tributos;
- Não substitui contador, assessor ou consultor profissional habilitado;
- Dados de mercado devem informar atraso e data/hora de referência;
- Usuário final não possui chat conversacional nem assistente de IA (*Fora do escopo permanente*);
- IA não realiza cálculos financeiros, tributários ou patrimoniais;
- IA não publica conteúdo automaticamente;
- É vedado o uso de dados pessoais ou financeiros de usuários para treinamento de modelos de IA sem base legal específica.

## Arquitetura e Estado Técnico

- Monólito modular orientado a domínio e eventos;
- Next.js, React e TypeScript em modo estrito;
- PostgreSQL com Drizzle ORM e migrações versionadas;
- Motor financeiro determinístico e independente baseado em `Decimal` e persistência `NUMERIC`;
- Testes unitários, de integração em PostgreSQL real e testes ponta a ponta (E2E);
- **Componentes Arquiteturais Planejados:** Jobs assíncronos em background e armazenamento privado de documentos em nuvem (S3/GCS) permanecem como infraestruturas planejadas;
- **Estado Real do Módulo de IA:** O diretório `src/modules/editorial-ai/` encontra-se atualmente vazio. Não existem SDKs de LLM, chaves de API, prompts versionados persistidos, filas, workers, rotas, telas ou tabelas de banco de dados para rascunhos, revisões e publicações editoriais. A IA editorial interna é uma capacidade planejada (Fase 10).

## Regras Financeiras

- Nunca usar `number` do JavaScript para dinheiro, preço, quantidade, taxa, câmbio, percentual financeiro ou custo médio;
- Usar `Decimal` em todos os cálculos matemáticos de domínio;
- Persistir valores financeiros com `NUMERIC` no PostgreSQL;
- Regras de arredondamento devem ser explícitas, centralizadas e testadas;
- Cálculos financeiros nunca devem residir em componentes React;
- Toda alteração financeira relevante deve manter trilha de auditoria;
- Eventos de carteira são fatos históricos auditáveis; correções operam via ajuste ou cancelamento lógico rastreável.

## Privacidade e Isolamento de Dados

- Dados financeiros são privados por usuário;
- Membros de plano compartilhado possuem dados 100% isolados entre si;
- O titular pagante gerencia pagamento, grupo e convites, mas não pode visualizar, editar ou inferir carteiras, ativos, operações, documentos, relatórios, tributos, alertas ou projeções dos membros;
- Consultas sensíveis devem validar autenticação e autorização no servidor pelo identificador do usuário autenticado.

## Importações

- Dados importados de planilhas ou documentos são candidatos a lançamento;
- Usuário deve revisar, confirmar e editar dados antes da gravação;
- PDFs e planilhas não constituem fonte imutável da verdade;
- O módulo de importações e storage privado permanece planejado (Fase 07).

## Dados de Mercado

- Consultas de usuários são atendidas pelo banco interno local da plataforma (`market_quotes` e `exchange_rates`);
- Não realizar chamadas diretas a provedores externos a cada carregamento de tela;
- Adaptadores de provedor devem ser substituíveis para permitir futura contratação de fontes pagas.

## Governança da Futura IA Editorial Interna (Fase 10)

- Uso estritamente interno para apoio à redação de análises sobre documentos públicos de Relações com Investidores (RI);
- Vínculo permanente e obrigatório entre a publicação aprovada e o documento-fonte público original;
- Cada análise constitui uma nova requisição independente, sem memória implícita entre execuções;
- Prompts versionados e estruturados por empresa, setor e tipo documental;
- **Revisão Humana Obrigatória:** Toda publicação exige aprovação explícita de analista humano;
- Nenhuma publicação ou rascunho de IA pode conter recomendações de investimento.

## Instruções para a IA de Engenharia

- Não invente requisitos, integrações, tabelas, APIs, credenciais ou fluxos;
- Não altere código fora do escopo expressamente autorizado;
- Não remova funcionalidades existentes sem autorização explícita;
- Declare sempre fatos conhecidos, premissas autorizadas e pontos em aberto;
- Prefira alterações pequenas, testáveis, reversíveis e documentadas;
- Quando faltar informação essencial, interrompa a execução e solicite esclarecimento.