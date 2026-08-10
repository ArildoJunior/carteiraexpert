# Fase 07 — Importações Revisáveis

## Objetivo

Permitir importação progressiva sem depender de integração com corretoras.

## Pacote 07.01 — CSV e XLSX

### Incluído

- Upload de CSV;
- Upload de XLSX;
- Modelo de planilha;
- Mapeamento de colunas;
- Validação;
- Candidatos de importação;
- Tela de revisão;
- Edição;
- Confirmação;
- Geração de eventos.

### Fora do escopo

- PDF;
- OCR;
- Integração com corretora;
- Importação automática sem revisão.

### Critérios de aceite

- [ ] Arquivo inválido é rejeitado;
- [ ] Dados válidos viram candidatos;
- [ ] Usuário edita quantidade, valor, data e taxas;
- [ ] Confirmação cria eventos auditáveis;
- [ ] Reenvio do mesmo arquivo não duplica eventos sem confirmação;
- [ ] Arquivo e origem ficam rastreáveis.

## Pacote 07.02 — PDF assistido

### Incluído

- Upload de PDF;
- Armazenamento privado;
- Job assíncrono;
- Extração inicial;
- Candidatos de lançamento;
- Revisão humana obrigatória;
- Tratamento de falha;
- Status de processamento.

### Fora do escopo

- Cobertura universal de todos os layouts;
- Lançamento automático;
- Integração direta com corretoras;
- Análise por IA sem controle.

### Critérios de aceite

- [ ] PDF fica privado;
- [ ] Processamento não bloqueia requisição web;
- [ ] Falhas são registradas;
- [ ] Usuário revisa e edita antes de confirmar;
- [ ] Mesma importação não gera duplicidade;
- [ ] Há aviso de que dados exigem conferência.