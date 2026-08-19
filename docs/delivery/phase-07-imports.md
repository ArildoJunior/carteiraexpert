# Fase 07 — Importações Revisáveis

## Objetivo

Permitir a importação progressiva de dados de operações via arquivos (planilhas e documentos), sempre com revisão humana prévia e sem dependência de conexões automáticas com corretoras.

## Estado Atual da Fase

> **Classificação:** **Planejada, não implementada.**  
> O diretório `src/modules/imports/` encontra-se vazio. Não existem rotas de upload, filas assíncronas, infraestrutura de armazenamento privado (buckets) ou parsers de planilhas/documentos implementados.

## Pacote 07.01 — Importação de CSV e XLSX

### Planejado

- Upload de planilhas nos formatos CSV e XLSX;
- Mapeamento e normalização de colunas para o modelo de eventos de carteira;
- Validação estrutural de tipos de dados, datas e valores numéricos;
- Geração de candidatos de importação em tabela temporária ou memória;
- Tela de conferência prévia e edição manual de quantidades, preços e taxas antes da gravação;
- Confirmação explícita do usuário gerando eventos na tabela `portfolio_events`.

### Critérios de Aceite (Não Concluídos)

- [ ] Arquivos inválidos ou corrompidos são rejeitados com mensagens claras;
- [ ] Usuário revisa e corrige dados antes da criação dos lançamentos;
- [ ] Confirmação cria eventos com origem (`source`) identificada;
- [ ] Reimportação do mesmo arquivo previne duplicações indevidas;
- [ ] Testes de validação e ingestão de planilhas implementados.

## Pacote 07.02 — Importação Assistida de Notas de Corretagem (PDF)

### Planejado

- Upload seguro de notas de corretagem em PDF;
- Armazenamento em bucket privado com acesso exclusivo por URLs temporárias assinadas;
- Extração assíncrona de texto estruturado via jobs em background;
- Apresentação de lançamentos candidatos para revisão obrigatória pelo usuário;
- Tratamento explícito de falhas de leitura ou layouts não reconhecidos.

### Fora do Escopo Permanente

- Leitura automática com lançamento direto sem conferência humana;
- Integração por Open Finance ou credenciais bancárias (fora do escopo).

### Critérios de Aceite (Não Concluídos)

- [ ] Arquivos PDF permanecem em armazenamento estritamente privado;
- [ ] Processamento pesado é executado de forma assíncrona;
- [ ] Falhas parciais ou totais de extração são registradas e informadas;
- [ ] Usuário é alertado de que os dados exigem conferência manual obrigatória.