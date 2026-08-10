# Limites dos Módulos

## Módulos principais

### identity

Responsável por:

- Usuários;
- Sessões;
- Autenticação;
- MFA futura;
- Consentimentos;
- Perfil;
- Autorização base.

Não é responsável por:

- Planos;
- Carteiras;
- Cobrança;
- Dados financeiros.

### subscriptions

Responsável por:

- Planos;
- Assinaturas;
- Entitlements;
- Grupos compartilhados;
- Convites;
- Status de acesso.

Não é responsável por:

- Ler ou alterar dados financeiros de usuários;
- Calcular carteira;
- Gerar relatórios tributários.

### portfolio

Responsável por:

- Carteiras;
- Contas;
- Operações;
- Eventos;
- Posição;
- Custo médio;
- Histórico;
- Auditoria financeira.

### corporate-actions

Responsável por:

- Split;
- Grupamento;
- Bonificação;
- Subscrição;
- Eventos societários futuros;
- Regras de ajuste de quantidade e custo.

### market-data

Responsável por:

- Ativos;
- Bolsas;
- Moedas;
- Cotações;
- Câmbio;
- Dados históricos;
- Provedores;
- Normalização;
- Cache.

### imports

Responsável por:

- Upload;
- Arquivos;
- Jobs de extração;
- Candidatos de importação;
- Revisão;
- Confirmação;
- Rastreamento de origem.

### tax

Responsável por:

- Períodos;
- Regras tributárias versionadas;
- Apoio mensal;
- Relatórios anuais;
- Alertas tributários.

Não é responsável por:

- Emitir DARF;
- Realizar pagamentos;
- Declarar obrigação definitiva.

### options

Responsável por:

- Contratos;
- Posições;
- Vencimentos;
- Alertas;
- Registro de rolagem;
- Organização operacional.

### editorial-ai

Responsável por:

- Documentos de RI;
- Classificação;
- Prompts;
- Solicitações de análise;
- Rascunhos;
- Revisão;
- Aprovação;
- Publicação.

Não é responsável por:

- Cálculos de carteira;
- Recomendação de investimento;
- Atendimento direto ao usuário final.

## Regra entre módulos

Um módulo não acessa tabelas internas de outro módulo sem contrato explícito.

Preferir:

- serviços internos;
- interfaces;
- eventos internos;
- consultas de leitura controladas.

Evitar:

- dependências circulares;
- regra de negócio duplicada;
- acesso indiscriminado ao banco;
- componentes React chamando múltiplos módulos diretamente.