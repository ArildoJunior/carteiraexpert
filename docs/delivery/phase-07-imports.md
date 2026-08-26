# Fase 07 — Importações Revisáveis

## Objetivo

Permitir a importação progressiva de dados de operações via arquivos (planilhas e documentos), sempre com revisão humana prévia e sem dependência de conexões automáticas com corretoras.

## Estado Atual da Fase

> **Classificação:** **Implementada e Publicada (Fluxos CSV Comprovados).**
>
> **Documento Oficial de Homologação:** Consulte [`phase-07-import-module.md`](file:///c:/Projetos/carteiraexpert/docs/delivery/phase-07-import-module.md) para o relatório completo de implementação, catálogo de tabelas, parsers, rotas e evidências de testes.
>
> **Nota Histórica:** Este documento representa o planejamento inicial pré-implementação. O módulo de importações CSV revisáveis (`carteiraexpert_csv`, `b3_trades_csv`, `b3_movements_csv`), deduplicação SHA-256, tela de revisão, edição de itens com `Decimal`, resolução de ativos e confirmação transacional atômica em `portfolio_events` foi integralmente entregue e validado com 100% de aprovação nos testes automatizados (704 unitários, 337 integração, 126 E2E). A expansão para arquivos binários `.xlsx` e extração de PDFs com bucket privado permanece planejada no Roadmap expandido.

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