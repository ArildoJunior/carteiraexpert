# Não Objetivos do Produto

O **CarteiraExpert** possui limites claros e finalidade estritamente informativa, organizacional e educacional.

## 1. O CarteiraExpert NÃO é:

- **Corretora ou Distribuidora:** não efetua custódia de recursos nem intermediação financeira;
- **Exchange:** não realiza compra, venda, conversão ou custódia de criptoativos;
- **Instituição Bancária ou de Pagamento:** não mantém contas de pagamento nem liquida transferências externas;
- **Consultoria ou Assessoria de Investimentos:** não presta serviços de orientação personalizada de investimentos;
- **Casa de Análise:** não emite relatórios com recomendações de compra, venda ou alocação;
- **Gestora de Recursos:** não administra patrimônio de terceiros nem toma decisões de alocação;
- **Plataforma de Execução de Ordens:** não roteia, não transmite e não executa ordens no mercado;
- **Gerador Definitivo de Obrigações Fiscais:** não substitui a responsabilidade tributária do contribuinte;
- **Emissor de DARF:** não gera guias oficiais de arrecadação fiscal nem processa pagamentos tributários;
- **Sistema de Sinais ou Copy Trading:** não fornece recomendações de timing, day trade ou espelhamento de operações;
- **Robô de Opções:** não executa rolagens automáticas nem estratégias de derivativos;
- **Plataforma de Carteiras Compartilhadas:** não permite visualização ou gestão compartilhada de patrimônio entre usuários em planos compartilhados.

## 2. Regras Específicas de Não-Objetivo

### 2.1. Agregação e Isolamento de Carteiras
- A regra aprovada para o dashboard é operar sobre a **carteira ou contexto selecionado**. No estado atual, o dashboard principal ainda agrega carteiras e deverá ser ajustado em implementação futura.
- Carteiras de finalidade `ESTUDO` e `ANALISE` não devem alterar ou contaminar as carteiras `REAL`. Essa separação formal ainda depende da implementação das finalidades no código.

### 2.2. Planos Compartilhados e Privacidade
- O titular pagante de um plano compartilhado **não ganha acesso** a carteiras, ativos, operações, extratos, saldos, documentos ou relatórios tributários dos demais membros do grupo.
- O pagamento conjunto representa unicamente compartilhamento de benefícios comerciais de software, nunca de dados financeiros.

### 2.3. Inteligência Artificial
- A IA **não calcula** impostos, rentabilidades, preços médios, posições ou métricas patrimoniais oficiais.
- A IA **não produz recomendações** de investimento nem rankings de "melhores ativos".
- A IA **não interage com usuários finais** através de chats, assistentes ou canais conversacionais.
- A IA editorial interna **nunca publica conteúdo automaticamente** sem revisão e aprovação humana expressa.

### 2.4. Dados de Mercado e Provedores
- Dados de mercado defasados **não são apresentados** como cotações em tempo real.
- A arquitetura da plataforma possui abstração interna desacoplada e substituível. Provedores externos reais ainda não foram confirmados como implementados no estado atual.

### 2.5. Apoio Tributário
- O produto prevê apoio tributário informativo e organizacional, baseado nas operações e resultados disponíveis. No estado atual, existem bases factuais parciais, como PnL realizado e eventos de proventos, mas não há módulo tributário completo. A plataforma não emite DARF, não elabora declaração completa de IRPF e não substitui contador ou advogado tributarista habilitado.