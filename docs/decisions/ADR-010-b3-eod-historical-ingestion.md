# ADR-010 — Ingestão de Dados Históricos e de Fim de Dia da B3

- **Status:** Aceita para implementação
- **Data:** 2026-08-26
- **Decisores:** Equipe do Carteira Expert
- **Escopo:** Fase 06 — Dados de Mercado, Valuation e Gráficos
- **Pacote relacionado:** 06.03 — Ingestão Histórica e Diária de Dados de Mercado da B3

## Contexto

O Carteira Expert precisa de uma fonte histórica de cotações para alimentar gráficos, estudos, indicadores, relatórios, valuation e outras análises oferecidas aos usuários.

A B3 disponibiliza arquivos de séries históricas em formato TXT de largura fixa, normalmente distribuídos dentro de arquivos ZIP no padrão `COTAHIST`. O projeto já analisou o arquivo original de 2016 e o layout oficial `SeriesHistoricas_Layout.pdf`. A análise identificou registros de header `00`, cotações `01`, trailer `99`, campos de preço com escala inteira, código BDI, tipo de mercado, fator de cotação e outros dados específicos do mercado brasileiro.

O arquivo enviado pela equipe para análise estava truncado em 100 MB. Por isso, o registro final incompleto foi considerado inválido e não pode ser utilizado como evidência de completude do ano.

A necessidade do produto não é redistribuir os arquivos da B3. A necessidade é armazenar e processar os dados internamente para que as pessoas que utilizam o sistema possam usufruir dos gráficos, estudos, relatórios e demais funcionalidades construídas sobre esses dados.

A FAQ oficial de Market Data da B3 informa que dados de fim de dia e históricos a partir de D-1 obtidos por meio das plataformas de Market Data B3 podem ser distribuídos sem custo por distribuidores ou redistribuidores, sem necessidade de autorização prévia. A menção ao UP2DATA é tratada nesta decisão como indicação de uma alternativa comercial de fornecimento estruturado, não como requisito técnico automático para o uso dos arquivos históricos públicos. A interpretação contratual deve ser confirmada pelo responsável jurídico antes de uma exploração comercial que altere o escopo aqui definido.

## Decisão

Adotaremos os arquivos originais de séries históricas da B3, no formato `COTAHIST`, como fonte inicial dos dados históricos e de fim de dia do sistema.

A ingestão será implementada como um pacote da **Fase 06**, denominado **Pacote 06.03**, sem criar uma nova fase e sem deslocar a responsabilidade para a Fase 08.

O sistema deverá:

1. receber os arquivos ZIP por uma área administrativa privada;
2. permitir o envio somente a administradores e funcionários com permissão explícita;
3. armazenar o ZIP original em área não pública;
4. registrar hash SHA-256, origem, período, usuário, timestamps e versão do parser;
5. processar o conteúdo em segundo plano;
6. validar header, trailer, tamanho das linhas, tipos de registro, campos e escalas conforme o layout oficial;
7. descartar registros incompletos ou truncados;
8. normalizar os dados e carregá-los na estrutura canônica de cotações do sistema, preferencialmente `market_quotes`, após confirmação do schema vigente;
9. garantir idempotência por hash e por chave de negócio;
10. manter auditoria, métricas, advertências e possibilidade de reprocessamento;
11. disponibilizar aos usuários somente os dados processados por meio das funcionalidades normais do produto;
12. identificar claramente a fonte B3 e a natureza histórica/de fim de dia dos dados.

Os arquivos brutos da B3 não serão oferecidos para download, redistribuídos ou vendidos como produto independente nesta solução.

## Justificativa

### Fonte original em vez de XLSX

O TXT original preserva o layout oficial e os campos necessários para uma carga confiável. A conversão para XLSX pode alterar tipos, zeros à esquerda, precisão, datas, limites de linhas e códigos. Portanto, o XLSX não será fonte canônica.

### Upload privado com processamento assíncrono

O upload restrito separa a operação interna do consumo do produto. O processamento assíncrono evita requisições longas, permite retentativas e torna o estado do lote observável.

### Base canônica de mercado

A manutenção de uma estrutura canônica reduz duplicidade e evita que gráficos, estudos e relatórios dependam diretamente do formato de origem. O adaptador COTAHIST será responsável por transformar o layout B3 em um modelo interno estável.

### Idempotência e auditoria

Arquivos podem ser reenviados, o worker pode falhar e um ano pode precisar ser reprocessado após correção. Hash, chave única, transações e estados de lote permitem repetir operações sem corromper a base ou criar duplicatas.

### Separação de preço bruto e preço ajustado

Os registros da B3 não devem ser chamados automaticamente de preços ajustados por eventos corporativos. Ajustes por dividendos, bonificações, desdobramentos ou grupamentos exigem dados de eventos e regras próprias. A ingestão inicial preservará a informação de origem e não inferirá ajustes.

### Fase correta

A ingestão de dados da B3 alimenta diretamente dados de mercado, valuation e gráficos, portanto pertence à Fase 06. A Fase 08 continua dedicada a ativos internacionais, câmbio e criptoativos.

## Modelo de segurança

- O armazenamento dos ZIPs e TXT será privado.
- A autorização será aplicada no backend.
- Usuários comuns não terão tela, endpoint ou URL pública para acesso aos arquivos.
- O sistema não deverá expor logs técnicos, hashes internos ou registros rejeitados para usuários comuns.
- A extração deverá impedir caminhos absolutos, `../`, arquivos executáveis e limites abusivos de descompactação.
- Cada ação administrativa relevante será auditada.

## Consequências positivas

- histórico de cotações sob controle operacional do produto;
- gráficos e estudos alimentados por uma fonte oficial de mercado;
- processamento diário reproduzível;
- reprocessamento seguro;
- rastreabilidade por lote, arquivo e versão do parser;
- ausência de dependência de conversões manuais para XLSX;
- possibilidade de complementar a solução com novas fontes no futuro;
- usuários recebem funcionalidades derivadas sem receber os arquivos brutos.

## Consequências e custos

- será necessário manter os arquivos originais e seus metadados;
- a equipe interna terá de enviar os arquivos diariamente;
- o sistema precisará de worker/job e monitoramento;
- mudanças no layout da B3 exigirão versionamento e testes;
- dados de eventos corporativos e preços ajustados continuarão sendo uma preocupação separada;
- será necessária uma política de retenção, backup e segurança para os arquivos;
- o produto deverá comunicar corretamente que os dados são de fim de dia, não em tempo real;
- a utilização comercial deverá permanecer dentro dos termos aplicáveis e ser revisada juridicamente quando o produto ou a forma de distribuição mudar.

## Alternativas consideradas

### Contratar UP2DATA como fonte obrigatória

**Não adotada neste momento.** Pode ser considerada no futuro se o produto precisar de entrega automatizada, formatos adicionais, eventos corporativos, cobertura ampliada, SLA ou redução do trabalho operacional. A decisão atual utiliza os arquivos históricos disponíveis e o fluxo privado de upload.

### Usar XLSX convertido pelo Excel

**Rejeitada.** O processo pode alterar o conteúdo e não preserva adequadamente a garantia do layout original.

### Criar uma tabela paralela exclusivamente para COTAHIST

**Não adotada como padrão.** A preferência é ampliar a estrutura canônica existente quando necessário e manter um adaptador de origem. Uma tabela de staging ou de rejeitos pode existir para o processamento, mas não deve se tornar uma segunda fonte canônica sem decisão específica.

### Buscar cotações diretamente no frontend

**Rejeitada.** Isso exporia a arquitetura à disponibilidade da fonte, dificultaria auditoria, poderia causar inconsistência entre telas e não atenderia ao requisito de controle do arquivo histórico.

### Permitir que usuários enviem arquivos

**Rejeitada.** O fluxo deve ser controlado por administradores e funcionários autorizados para preservar qualidade, segurança, origem e responsabilidade operacional.

## Requisitos de implementação decorrentes

- criar ou adaptar entidade de lote de importação;
- criar auditoria de ações e processamento;
- confirmar e evoluir o schema vigente de `market_quotes`;
- adicionar origem `B3_COTAHIST` ou equivalente;
- implementar parser versionado;
- implementar validação de header, trailer, linhas e escalas;
- implementar armazenamento privado;
- implementar worker e estados de processamento;
- implementar chave única e upsert idempotente;
- criar relatório operacional do lote;
- proteger endpoints e telas administrativas;
- adicionar testes de parser, persistência, autorização e integração com gráficos;
- homologar primeiro o ano de 2016 usando o arquivo completo;
- somente depois expandir para os demais anos históricos.

## Critérios de validade da decisão

Esta ADR permanece válida enquanto:

- o objetivo for usar dados históricos/de fim de dia como insumo interno;
- os arquivos brutos não forem redistribuídos aos usuários;
- o acesso ao upload permanecer restrito;
- o sistema identificar corretamente a origem B3;
- os dados não forem apresentados como tempo real;
- os termos aplicáveis da B3 não forem alterados de forma incompatível com este uso.

A ADR deverá ser revisada se o produto passar a redistribuir arquivos brutos, vender a base histórica, oferecer cotações intradiárias, automatizar a aquisição por outro canal ou contratar um serviço comercial de dados.

## Referências

- [FAQ de Distribuidores do Market Data B3](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/distribuidores/perguntas-frequentes/)
- [Histórico de Market Data B3](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/)
- Layout oficial analisado: `SeriesHistoricas_Layout.pdf` — referência de trabalho local; confirmar a versão oficial correspondente a cada arquivo recebido.

## Nota final

Esta decisão define a arquitetura e o fluxo operacional do produto. Ela não substitui a validação jurídica dos termos de uso aplicáveis, especialmente se o escopo comercial ou a forma de apresentação dos dados for ampliado no futuro.
