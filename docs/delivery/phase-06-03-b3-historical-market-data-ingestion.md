# Pacote 06.03 — Ingestão Histórica e Diária de Dados de Mercado da B3

**Fase:** 06 — Dados de Mercado, Valuation e Gráficos  
**Status:** Planejado — especificação para implementação  
**Tipo:** Entrega funcional e operacional  
**Fonte inicial:** Arquivos oficiais de séries históricas da B3 (`COTAHIST`)  
**Última atualização:** 2026-08-26

## 1. Objetivo

Implementar uma rotina segura, auditável e idempotente para que administradores e funcionários autorizados enviem diariamente os arquivos ZIP de cotações de fim de dia da B3. O sistema deverá armazenar os arquivos em área privada, processá-los em segundo plano, validar o formato oficial, normalizar os registros e disponibilizar os dados processados para gráficos, estudos, relatórios, valuation e demais funcionalidades do produto.

Os usuários comuns não terão acesso aos arquivos ZIP/TXT, à tela de upload, aos logs técnicos ou aos relatórios internos de importação. Eles utilizarão somente as funcionalidades do sistema que consultam os dados processados.

## 2. Contexto e decisões já tomadas

- A implementação pertence à **Fase 06** e deve ser registrada como **Pacote 06.03**; não deve criar uma nova fase.
- A Fase 08 permanece reservada para ativos internacionais, câmbio e criptoativos.
- A fonte inicial será o TXT original da B3, normalmente contido no ZIP `COTAHIST_AAAA.ZIP`.
- O TXT original deve ser usado na carga definitiva; arquivos XLSX convertidos pelo Excel não devem ser usados como fonte canônica.
- Os dados serão utilizados internamente pelo sistema para gráficos, estudos, indicadores, relatórios e análises.
- Os arquivos brutos não serão disponibilizados para download nem redistribuídos aos usuários.
- Os dados serão identificados como cotações históricas/de fim de dia, sem promessa de cotação em tempo real.
- A origem da cotação deverá permanecer identificada como B3/COTAHIST.

A interpretação regulatória e contratual deve continuar sendo validada pelo responsável jurídico do produto. Esta especificação não constitui parecer jurídico.

## 3. Evidências técnicas já analisadas

O arquivo original fornecido para análise e o layout oficial `SeriesHistoricas_Layout.pdf` indicaram:

- formato de largura fixa;
- registros de aproximadamente 245 bytes por linha no material analisado;
- registro de abertura/cabeçalho com tipo `00`;
- registros de negociação com tipo `01`;
- registro de encerramento/trailer com tipo `99`;
- preços armazenados em escala inteira, com normalização monetária por divisão por 100 nos campos aplicáveis;
- presença de código BDI, tipo de mercado, fator de cotação, distribuição e campos específicos de instrumentos;
- a amostra de 2016 continha 424.523 registros completos entre 04/01/2016 e 29/11/2016 antes do truncamento;
- o registro final truncado da amostra deve ser descartado, nunca importado.

As posições, tamanhos, escalas e regras definitivas devem ser implementadas exclusivamente com base no layout oficial correspondente à versão do arquivo recebido.

## 4. Escopo funcional

### Incluído

1. Upload privado de ZIP por administrador ou funcionário autorizado.
2. Registro do lote de importação antes do processamento.
3. Armazenamento privado do arquivo original.
4. Cálculo e persistência do SHA-256.
5. Validação de extensão, tamanho, integridade e conteúdo.
6. Extração controlada do TXT original.
7. Parser de largura fixa conforme layout oficial.
8. Validação de header, trailer e registros.
9. Normalização de datas, preços, quantidades, volumes e fatores.
10. Deduplicação e carga idempotente.
11. Processamento assíncrono por worker/job.
12. Retentativas controladas e possibilidade de retomada.
13. Auditoria completa do envio e processamento.
14. Relatório operacional do lote.
15. Disponibilização dos dados processados às consultas existentes de mercado.
16. Homologação inicial com 2016 e expansão posterior para os demais anos.

### Fora do escopo inicial

- cotações em tempo real ou com atraso intradiário;
- redistribuição dos arquivos brutos;
- venda ou licenciamento da base bruta;
- ajuste automático de preços por dividendos, bonificações, desdobramentos ou grupamentos sem módulo próprio de eventos corporativos;
- garantia de que todo ticker encontrado no arquivo seja um instrumento atualmente negociável;
- substituição imediata de todas as fontes existentes sem validação de precedência;
- ingestão automática por acesso direto à B3 sem que o arquivo seja previamente disponibilizado no fluxo administrativo definido.

## 5. Fluxo de negócio

```text
Administrador/funcionário autorizado
              ↓
       Upload do ZIP da B3
              ↓
       Armazenamento privado
              ↓
     Registro do lote e auditoria
              ↓
     Validação de arquivo e hash
              ↓
        Fila de processamento
              ↓
     Extração segura do COTAHIST
              ↓
      Parser de largura fixa
              ↓
  Validação de header/trailer/linhas
              ↓
    Normalização e deduplicação
              ↓
        Carga transacional
              ↓
     Relatório final do lote
              ↓
 Gráficos, estudos e relatórios do produto
```

O upload não deve executar toda a carga dentro da requisição HTTP. A requisição deve concluir o recebimento e enfileirar o processamento; o worker será responsável pela execução, atualização de status e registro de erros.

## 6. Controle de acesso

### Atores permitidos

- administradores;
- funcionários com permissão explícita para ingestão de dados de mercado.

### Atores não permitidos

- usuários comuns;
- usuários sem a permissão operacional específica;
- serviços públicos ou endpoints anônimos.

### Requisitos

- aplicar autorização no backend, não apenas ocultar botões no frontend;
- proteger o armazenamento por URL não pública ou mecanismo equivalente;
- não expor o nome físico nem a localização privada do arquivo;
- registrar quem enviou, reprocessou, cancelou ou consultou o lote;
- impedir que usuários comuns obtenham o arquivo por enumeração de IDs, URLs ou endpoints;
- aplicar limites de tamanho, tipo MIME, quantidade de uploads e retenção conforme a política operacional;
- validar o conteúdo real do arquivo, sem confiar apenas na extensão `.ZIP`.

## 7. Modelo de lote de importação

A implementação deve criar ou adaptar uma entidade própria para representar cada arquivo recebido. Sugestão de campos:

- `id`;
- `source` — por exemplo, `B3`;
- `format` — `COTAHIST`;
- `original_filename`;
- `storage_key` ou referência privada equivalente;
- `sha256`;
- `file_size_bytes`;
- `reference_year`;
- `reference_date_start`;
- `reference_date_end`;
- `header_date` e demais metadados identificáveis;
- `status`;
- `uploaded_by`;
- `uploaded_at`;
- `started_at`;
- `finished_at`;
- `total_lines`;
- `valid_records`;
- `imported_records`;
- `updated_records`;
- `duplicate_records`;
- `rejected_records`;
- `truncated_records`;
- `warning_count`;
- `error_summary`;
- `parser_version`;
- `layout_version`;
- `created_at` e `updated_at`.

### Estados sugeridos

```text
RECEIVED
VALIDATING
QUEUED
PROCESSING
COMPLETED
COMPLETED_WITH_WARNINGS
FAILED
DUPLICATE
CANCELLED
```

As transições devem ser controladas e auditáveis. Um lote concluído não deve ser silenciosamente sobrescrito por outro arquivo de mesmo conteúdo.

## 8. Armazenamento e segurança dos arquivos

- armazenar o ZIP original em área privada;
- manter o arquivo original imutável após o recebimento;
- calcular o SHA-256 antes da confirmação do lote;
- impedir execução de qualquer conteúdo extraído;
- rejeitar caminhos maliciosos no ZIP, como `../` e caminhos absolutos;
- limitar tamanho total descompactado e número de entradas;
- extrair somente o TXT esperado para uma área temporária privada;
- remover ou expirar artefatos temporários após o processamento, conforme necessidade de auditoria;
- nunca servir o ZIP diretamente por endpoint público;
- manter retenção definida para arquivo original, rejeitos e logs.

## 9. Regras do parser COTAHIST

O parser deve:

1. ler o arquivo como texto, respeitando o encoding definido no layout/arquivo oficial;
2. preservar a linha original durante a validação;
3. identificar o tipo de registro nas posições oficiais;
4. validar o header `00`;
5. processar somente registros `01` válidos;
6. validar o trailer `99` e seus totais, quando presentes;
7. rejeitar linhas menores que o tamanho mínimo oficial;
8. tratar terminadores de linha sem contaminar os campos de largura fixa;
9. não importar a última linha quando estiver incompleta ou truncada;
10. converter campos numéricos vazios para `NULL` quando o layout permitir;
11. aplicar as escalas do layout somente nos campos definidos;
12. preservar os valores brutos necessários para auditoria quando houver risco de perda de informação;
13. produzir erro localizado com número da linha e motivo;
14. não interromper necessariamente todo o lote por um registro inválido, desde que a política de qualidade permita concluir com advertências;
15. falhar o lote quando houver quebra de estrutura, header incompatível, trailer ausente quando obrigatório ou divergência crítica.

O parser deve ser versionado. Mudanças no layout, posições ou regras de conversão devem gerar nova versão e não alterar silenciosamente a interpretação de lotes antigos.

## 10. Normalização dos dados

Os dados normalizados devem manter a distinção entre:

- valor bruto informado no arquivo;
- valor convertido para uso monetário;
- fator de cotação;
- quantidade negociada;
- volume financeiro;
- tipo de mercado;
- código BDI;
- instrumento/ticker;
- data de negociação;
- origem e lote de importação.

Preços e volumes devem utilizar tipos numéricos adequados, evitando `float` binário para valores monetários quando o modelo do projeto oferecer tipo decimal.

A normalização não deve aplicar ajustes corporativos por inferência. Eventos de dividendos, desdobramentos e grupamentos devem ser tratados em camada própria, com fonte e auditoria independentes.

## 11. Chave e idempotência

A carga deve impedir duplicação quando o mesmo ZIP for enviado novamente ou quando o mesmo período for reprocessado. A chave de negócio recomendada para a cotação, sujeita à confirmação do schema atual, é:

```text
(trading_date, ticker, bdi_code, market_type, distribution_number)
```

Quando necessário, incluir outros discriminadores do layout, como tipo de instrumento, especificação do papel ou número de distribuição.

Requisitos:

- índice único coerente com a chave de negócio;
- SHA-256 único ou mecanismo equivalente para detectar o mesmo arquivo;
- operações de upsert/transação sem duplicar registros;
- reprocessamento seguro após falha;
- não apagar dados válidos anteriores antes de validar o novo lote;
- registrar se cada registro foi inserido, atualizado, ignorado ou rejeitado.

## 12. Integração com `market_quotes`

Antes da implementação, o agente deve confirmar o schema vigente de `market_quotes` e os serviços existentes. A diretriz é manter uma tabela canônica de cotações, ampliando-a somente quando necessário, em vez de criar uma segunda fonte paralela sem justificativa.

Campos específicos da B3 que podem ser necessários, conforme o layout e o modelo atual:

- `bdi_code`;
- `market_type`;
- `security_specification`;
- `term_code`;
- `currency`;
- `open_price`;
- `high_price`;
- `low_price`;
- `average_price`;
- `last_price`;
- `best_bid_price`;
- `best_ask_price`;
- `trade_count`;
- `traded_quantity`;
- `traded_volume`;
- `exercise_price`;
- `correction_indicator`;
- `expiration_date`;
- `quotation_factor`;
- `exercise_points`;
- `distribution_number`;
- `source_import_id`.

O `MarketDataIngestionService` e os adaptadores existentes devem continuar funcionando. O novo adaptador COTAHIST deve informar a origem, a data de referência, a qualidade e o lote de importação.

## 13. Atualização diária

O processo operacional diário será:

1. B3 disponibiliza o arquivo de referência.
2. Administrador ou funcionário autorizado envia o ZIP pela área interna.
3. O sistema valida o arquivo e cria o lote.
4. O sistema detecta duplicidade por hash e período.
5. O lote é colocado em fila.
6. O worker processa o arquivo.
7. O sistema grava estatísticas e advertências.
8. O lote é marcado como concluído ou concluído com advertências.
9. Consultas, gráficos e estudos passam a utilizar os dados disponíveis.
10. Em caso de falha, o responsável recebe o erro operacional e pode corrigir/reprocessar sem duplicar dados.

A automação diária deve ser baseada no upload privado e no processamento assíncrono. Um agendador pode ser adicionado posteriormente para verificações, alertas ou tarefas de manutenção, mas não deve eliminar o controle de origem e do arquivo recebido.

## 14. Qualidade, observabilidade e auditoria

Registrar, no mínimo:

- usuário responsável pelo upload;
- timestamps de cada etapa;
- hash e tamanho do arquivo;
- versão do parser e do layout;
- período coberto;
- quantidades lidas, válidas, rejeitadas, duplicadas e importadas;
- linhas com erro e motivo;
- status final;
- tentativas e duração do processamento;
- versão da aplicação;
- correlações entre lote, job e logs.

Criar alertas para:

- arquivo duplicado;
- ausência de header/trailer;
- arquivo sem registros válidos;
- período inesperado;
- queda significativa no volume de registros;
- aumento anormal de rejeições;
- falha de processamento;
- lote parado por tempo acima do limite.

## 15. Homologação inicial

A primeira homologação deve usar o arquivo original completo de 2016, não a amostra truncada. O roteiro mínimo é:

1. enviar o ZIP em ambiente de homologação;
2. conferir hash, tamanho e arquivo interno;
3. validar header e trailer;
4. confirmar descarte de linha incompleta;
5. comparar quantidade de registros válidos com a fonte;
6. verificar datas inicial e final;
7. selecionar amostras de ativos e datas para conferência manual;
8. conferir escalas de preços, volumes e fator de cotação;
9. repetir o envio para comprovar idempotência;
10. interromper e retomar o processamento;
11. verificar autorização com usuário autorizado e usuário comum;
12. validar gráficos e estudos consumindo os dados processados;
13. aprovar a carga antes de expandir para os demais anos.

A amostra já analisada não deve ser usada para afirmar completude do ano de 2016, pois estava truncada em 100 MB.

## 16. Testes obrigatórios

### Parser

- header válido;
- trailer válido;
- registro `01` válido;
- linha curta;
- linha truncada;
- encoding inválido;
- campo numérico vazio;
- escala decimal;
- data inválida;
- tipo de registro desconhecido;
- trailer ausente;
- divergência entre trailer e registros;
- ZIP com mais de um TXT inesperado;
- ZIP malformado ou com caminho inseguro.

### Persistência

- inserção;
- atualização idempotente;
- duplicidade por hash;
- duplicidade por chave de negócio;
- rollback em falha transacional;
- retomada de lote interrompido;
- isolamento entre lotes.

### Autorização

- administrador consegue enviar e acompanhar;
- funcionário autorizado consegue enviar e acompanhar;
- funcionário sem permissão é bloqueado;
- usuário comum não vê upload nem acessa arquivos;
- endpoints não permitem enumeração ou download indevido.

### Produto

- gráficos exibem data e origem;
- estudos usam o preço correto;
- dados sem ajuste corporativo são identificados adequadamente;
- ausência de dados não é confundida com preço zero;
- consultas continuam compatíveis com fontes já existentes.

## 17. Critérios de aceite

A entrega será considerada pronta quando:

- somente perfis autorizados conseguirem enviar arquivos;
- o ZIP ficar inacessível aos usuários comuns;
- o hash e o lote forem registrados antes do processamento;
- o parser seguir o layout oficial versionado;
- linhas truncadas não forem importadas;
- header/trailer e contagens forem validados;
- o processamento ocorrer fora da requisição de upload;
- reenvio do mesmo arquivo não duplicar dados;
- falhas puderem ser identificadas e reprocessadas;
- todas as operações relevantes forem auditáveis;
- a carga de homologação de 2016 for validada;
- gráficos e estudos consumirem os dados normalizados;
- a interface informar que os dados são históricos/de fim de dia e indicar a B3 como fonte;
- não houver endpoint público para o arquivo bruto;
- testes unitários, integração e autorização forem aprovados.

## 18. Ordem recomendada de implementação

1. Confirmar schema e contratos atuais de `market_quotes` e ingestão.
2. Criar migração para lotes, auditoria e campos estritamente necessários.
3. Implementar armazenamento privado e autorização.
4. Implementar recebimento, hash e validação inicial.
5. Implementar extração segura do ZIP.
6. Implementar parser versionado baseado no layout oficial.
7. Implementar normalização e validações de qualidade.
8. Implementar carga idempotente e transacional.
9. Implementar worker, estados e retentativas.
10. Implementar tela/endpoint interno de acompanhamento.
11. Integrar consultas, gráficos e estudos.
12. Executar homologação de 2016.
13. Corrigir divergências e registrar evidências.
14. Importar os demais anos em lotes controlados.
15. Ativar rotina operacional diária e alertas.

## 19. Resultado esperado

Ao final, o sistema deverá permitir que a equipe interna envie diariamente o ZIP de fim de dia da B3, sem expor os arquivos brutos aos usuários. O produto utilizará as cotações processadas como base para suas funcionalidades de mercado, gráficos, estudos e relatórios, preservando origem, histórico, auditoria, qualidade e possibilidade de reprocessamento.
