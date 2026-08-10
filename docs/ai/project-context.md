# CarteiraExpert — Contexto Permanente para IA

## Produto

O CarteiraExpert é um SaaS brasileiro de consolidação patrimonial para ativos
brasileiros, internacionais, moedas e criptoativos.

A plataforma organiza carteira, operações, eventos corporativos, projeções,
opções, informações tributárias de apoio, dados de mercado e conteúdo editorial.

## Limites obrigatórios

- Não recomenda compra, venda, manutenção ou rolagem.
- Não executa ordens.
- Não transmite ordens para corretoras ou exchanges.
- Não emite DARF.
- Não efetua pagamentos.
- Não substitui contador, assessor ou consultor profissional.
- Dados de mercado devem informar atraso e data/hora de referência.
- Usuário final não conversa diretamente com a IA editorial.
- IA não realiza cálculos financeiros, tributários ou patrimoniais.
- IA não publica conteúdo automaticamente.

## Arquitetura

- Monólito modular orientado a domínio e eventos;
- Next.js;
- React;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Jobs assíncronos;
- Armazenamento privado de documentos;
- Motor financeiro determinístico e independente;
- Testes unitários, integração e ponta a ponta.

## Regras financeiras

- Nunca usar `number` do JavaScript para dinheiro, preço, quantidade,
  taxa, câmbio, percentual financeiro ou custo médio.
- Usar Decimal no código.
- Persistir valores financeiros com NUMERIC no PostgreSQL.
- Regras de arredondamento devem ser explícitas, centralizadas e testadas.
- Cálculos financeiros nunca devem ficar em componentes React.
- Toda alteração financeira relevante deve ser auditável.
- Eventos de carteira são imutáveis; correções devem ser rastreáveis.

## Privacidade

- Dados financeiros são privados por usuário.
- Membros de plano compartilhado são isolados.
- O titular pagante pode gerir pagamento, grupo e convites.
- O titular pagante não pode ver carteira, operações, documentos, relatórios,
  impostos, alertas, estudos ou projeções de membros.
- Toda consulta sensível deve validar autenticação e autorização no servidor.

## Importação

- Dados importados são candidatos a lançamento.
- Usuário deve revisar, confirmar e editar dados importados.
- PDFs e planilhas não são fonte imutável da verdade.
- Alterações devem manter auditoria.

## Dados de mercado

- Usuários consultam dados do banco interno da plataforma.
- Não consultar diretamente um provedor externo a cada tela aberta.
- Fontes gratuitas serão usadas inicialmente quando permitido.
- A arquitetura deve permitir troca futura por fontes pagas.

## Conteúdo editorial com IA

- Uso interno.
- Documento original deve ser vinculado ao conteúdo publicado.
- Cada análise é uma nova requisição.
- Prompts devem ser específicos por empresa, setor e tipo documental.
- Revisão humana é obrigatória antes de qualquer publicação.
- Nenhuma análise pode afirmar recomendação de compra ou venda.

## Instruções para a IA

- Não invente requisitos, integrações, tabelas, APIs ou fluxos.
- Não altere código fora do escopo autorizado.
- Não remova funcionalidades existentes sem autorização explícita.
- Declare fatos conhecidos, premissas e pontos em aberto.
- Prefira mudanças pequenas, testáveis, reversíveis e documentadas.
- Quando faltar informação essencial, interrompa e faça uma única pergunta objetiva.