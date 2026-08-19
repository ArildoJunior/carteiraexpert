# Visão Geral da Arquitetura

## 1. Estilo Arquitetural

O **CarteiraExpert** adota o estilo de **Monólito Modular** orientado a domínio e eventos no núcleo patrimonial.

## 2. Stack Tecnológica

### 2.1. Tecnologias Efetivamente em Uso no Repositório
Comprovadas no `package.json`, configurações e código-fonte:

- **Framework Web e Aplicação:** Next.js (App Router, Server Components e Server Actions), React e TypeScript em `strict mode`;
- **Banco de Dados e ORM:** PostgreSQL, Drizzle ORM e driver `postgres`;
- **Segurança e Criptografia:** `argon2` (hash de senhas com Argon2id) e módulos criptográficos nativos do Node.js (SHA-256 para tokens de sessão e HMAC-SHA256 para rate limit);
- **Motor Financeiro e Validação:** `decimal.js` (para precisão arbitrária em cálculos matemáticos) e Zod (validação de schemas em runtime);
- **Estilização e Visualização:** Tailwind CSS e Recharts (para gráficos de alocação e evolução patrimonial);
- **Qualidade e Testes:** Biome (linter e formatador), Vitest (testes unitários e de integração) e Playwright (testes ponta a ponta — E2E).

### 2.2. Componentes Arquiteturais Planejados (Não Instalados / Em Evolução)
Os seguintes itens representam direcionamentos da arquitetura ainda não presentes ou não ativados na infraestrutura atual:
- **Mensageria e Filas de Jobs:** Solução assíncrona dedicada (ex: BullMQ / Redis) para processamento em segundo plano (*Planejado, não implementado*);
- **Armazenamento Privado de Documentos:** Infraestrutura privada de storage (S3 / GCS) com geração de URLs temporárias assinadas (*Planejado, não implementado*);
- **Provedores Externos de Mercado:** Conexão direta a provedores de dados de mercado externos via rede (*Planejado, não implementado*).

## 3. Princípios Arquiteturais Fundamentais

1. **Aplicação Única e Coesa:** Um único monólito modular bem delimitado para simplificar a operação, consistência transacional e testes.
2. **Banco Relacional como Fonte de Verdade:** Todas as operações financeiras e entidades do sistema são persistidas no PostgreSQL com tipos estritos (`NUMERIC` para valores e `TIMESTAMPTZ` para datas em UTC).
3. **Preservação Histórica e Domínio Orientado a Eventos:** Eventos operacionais e societários constituem a base de cálculo e rastreabilidade patrimonial.
4. **Cálculo Desacoplado da Interface e da IA:** Motores matemáticos determinísticos calculam posições, PnL e valuations independentemente de telas e sem qualquer intervenção de IA.
5. **Dados de Mercado Servidos Internamente:** Consultas de tela são 100% atendidas pelo banco de dados local a partir de ingestões prévias, evitando chamadas síncronas a fornecedores externos.
6. **Governança Estrita de IA:** A inteligência artificial é reservada exclusivamente ao apoio do fluxo editorial interno sob revisão humana obrigatória.

## 4. Contexto Operacional do Dashboard e Carteiras

- **Regra de Produto Aprovada:** O dashboard principal da plataforma deverá operar sobre uma **carteira selecionada** ou contexto selecionado pelo usuário, sem somar automaticamente o patrimônio de carteiras distintas.
- **Estado Atual da Implementação:**
  - A rota `/portfolios/[id]` já opera estritamente sobre a carteira específica selecionada (*Implementado e validado no código*).
  - A rota principal `/dashboard` ainda consolida e agrega todas as carteiras ativas do usuário por moeda base (*Contradito pelo código atual; transição planejada para dashboard contextual*).
  - Seleção persistida de carteira no dashboard principal e carteira padrão configurável: *Planejadas, não implementadas*.

## 5. Fluxo Geral de Dados

Usuário / Cliente HTTP  
  → Interface Next.js (Server Components / Client Components)  
  → Camada de Aplicação (Server Actions com validação de sessão e Zod)  
  → Módulos de Domínio (Motores puros em `Decimal`)  
  → PostgreSQL (Transações ACID, triggers e constraints)  
  → Adaptadores Internos de Ingestão (para dados de mercado e câmbio)

## 6. Escala e Evolução

- A camada web da aplicação deve ser stateless para permitir escalonamento horizontal de instâncias.
- Processamentos pesados (extração de PDFs, reprocessamentos históricos massivos) devem ser delegados a jobs assíncronos quando o volume justificar.
- **Regra de Evolução:** Não extrair microserviços sem métrica mensurável, gargalo real comprovado ou exigência operacional formal.