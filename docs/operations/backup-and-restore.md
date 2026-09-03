# Playbook Operacional — Backup, Restauração e Recuperação de Desastre

**Documento:** `docs/operations/backup-and-restore.md`  
**Versão:** 1.0.0  
**Data:** 03 de setembro de 2026  
**Status:** Vigente — Entrega 1 (Resiliência Operacional e Segurança)

---

## 1. Objetivo

Este playbook estabelece os procedimentos operacionais para geração de backups lógicos, restauração assistida em ambientes isolados e validação estrutural pós-restauração para a base de dados PostgreSQL do **CarteiraExpert**.

> [!IMPORTANT]
> **Aviso de Governança Operacional:**
> 1. A existência e validação de scripts locais de backup e restauração **não equivalem a um sistema gerenciado de recuperação em nuvem**.
> 2. O backup em produção, a retenção em armazenamento externo imutável (ex: bucket S3/GCS com versionamento) e os testes periódicos em infraestrutura de hospedagem são de **responsabilidade do operador de infraestrutura**.
> 3. Não existe garantia real de recuperação sem validação empírica de restauração.
> 4. O gateway de pagamento real (Stripe/Asaas) está explicitamente **fora do escopo** desta entrega e não faz parte deste playbook.

---

## 2. Escopo

- **Abrangência:**
  - Base de dados PostgreSQL (schema `public`), incluindo tabelas relacionais de usuários, sessões, consentimentos LGPD, planos, ativos, carteiras, eventos operacionais, cotações de mercado e trilha de auditoria (`audit_logs`).
  - Scripts utilitários locais do repositório: `scripts/backup-db.ts` e `scripts/restore-db.ts`.
- **Fora de Escopo:**
  - Snapshots de disco no nível de sistema operacional / nuvem (AWS EBS, GCP PD).
  - Configuração de WAL archiving contínuo (WAL-G, pgBackRest) em instâncias gerenciadas (ex: AWS RDS, Supabase, Neon, Cloud SQL).

---

## 3. Pré-Requisitos

1. **Binários do PostgreSQL:**
   - Ferramentas de cliente `pg_dump` e `psql` (versão 15 ou superior) instaladas no ambiente e acessíveis no `PATH`.
2. **Ambiente Node.js / Runtime:**
   - Node.js versão 20 LTS ou superior com `pnpm` e `tsx` disponíveis.
3. **Acesso de Rede:**
   - Conectividade TCP autorizada à porta 5432 do PostgreSQL com permissões de leitura no banco de origem e permissões de escrita/criação no banco de destino.

---

## 4. Variáveis de Ambiente Necessárias

| Variável | Finalidade | Exemplo de Valor (Mascarado) |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão com o banco de dados principal. | `postgresql://user:***@host:5432/carteiraexpert` |
| `DATABASE_URL_TEST` | String de conexão com banco de testes local ou de CI. | `postgresql://user:***@localhost:5432/carteiraexpert_test` |
| `RESTORE_TARGET_URL` | String de conexão para o banco **descartável/isolado** onde o backup será restaurado e validado. | `postgresql://user:***@localhost:5432/carteiraexpert_restore_temp` |

> [!CAUTION]
> **Proteção contra Sobrescrita Acidental:**
> O script `scripts/restore-db.ts` contém uma trava de segurança nativa que **bloqueia sumariamente a execução** se a `RESTORE_TARGET_URL` for idêntica à `DATABASE_URL`. A restauração direta sobre o banco principal exige autorização e flags manuais explícitas.

---

## 5. Procedimentos Operacionais

### 5.1. Geração de Backup Lógico

Para gerar um dump lógico limpo, desassociado de donos específicos e com mascaramento de credenciais nos logs:

```bash
# Execução padrão (gera arquivo em backups/backup_YYYY-MM-DD_HH-MM-SS.sql)
pnpm run db:backup

# Ou especificando arquivo de saída personalizado:
pnpm run db:backup -- --output backups/dump_manual_pre_release.sql
```

**Comportamento do Script:**
1. Valida a presença e o formato da string de conexão;
2. Mascara senhas e usuários no log emitido para stdout (`postgresql://***:***@host:port/db`);
3. Dispara `pg_dump` com flags `--no-owner --no-privileges`;
4. Valida se o arquivo resultante possui tamanho superior a zero bytes;
5. Retorna código de saída `0` em caso de sucesso e `1` em caso de falha.

---

### 5.2. Restauração e Validação em Ambiente Descartável

A validação empírica exige restaurar o arquivo gerado em um banco de dados novo, descartável ou schema isolado, garantindo que o dump não sofreu corrupção.

```bash
# Restauração no banco descartável isolado
pnpm run db:restore -- --file backups/dump_manual_pre_release.sql --target-url "postgresql://postgres:postgres@localhost:5432/carteiraexpert_restore_temp"
```

**Etapas Executadas Automaticamente pelo Script:**
1. **Trava de Segurança:** Verifica se a URL de destino não é o banco de produção;
2. **Carga dos Dados:** Executa o `psql` contra o banco de destino;
3. **Validação Estrutural Pós-Restauração:**
   - Conecta ao banco de destino recém-restaurado;
   - Consulta `information_schema.tables` e enumera todas as tabelas presentes;
   - Verifica a existência das tabelas estruturais centrais: `users`, `sessions`, `portfolios`, `assets`, `portfolio_events`, `market_quotes`, `audit_logs`;
   - Executa `count(*)` nas tabelas e emite um relatório das contagens;
   - Assegura que o schema é legível e queryable sem erros de corrupção.

---

### 5.3. Procedimento em Caso de Falha de Restauração

Se a restauração falhar (código de saída `1` ou erro no `psql`):
1. Inspecione o log de erro emitido pelo `restore-db.ts` (que estará com credenciais mascaradas);
2. Verifique se o binário `psql` possui versão compatível com a versão do servidor PostgreSQL;
3. Verifique se o banco de destino possui permissões suficientes (`CREATE TABLE`, `CREATE INDEX`);
4. Não execute nenhuma migração de schema durante ou imediatamente após a restauração;
5. Declare o backup como **inválido** e gere um novo dump lógico antes de prosseguir com qualquer manutenção.

---

### 5.4. Procedimento de Rollback de Aplicação / Banco

Caso uma migração ou atualização de versão da aplicação resulte em corrupção de dados ou inconsistência irreparável em homologação:
1. Interrompa imediatamente o tráfego da aplicação (ative modo de manutenção ou aponte o tráfego para a página de indisponibilidade via roteador/load balancer);
2. Crie um backup de estado forense do banco corrompido (`backup_forense_falha.sql`) para auditoria posterior;
3. Crie um banco novo limpo na infraestrutura (`carteiraexpert_recovered`);
4. Restaure o último backup íntegro validado utilizando `pnpm run db:restore`;
5. Execute a validação estrutural (`pnpm run db:verify`);
6. Aponte a variável `DATABASE_URL` da aplicação para a nova base recuperada e reinicie os serviços;
7. Verifique o endpoint de readiness (`GET /api/health?check=ready`).

---

## 6. Divisão de Responsabilidades

| Responsabilidade | Agente de IA / Engenharia de Software | Operador de Infraestrutura / SRE |
| :--- | :---: | :---: |
| Criação e manutenção dos scripts de backup e restore no repositório | **SIM** | Não |
| Proteções de segurança contra sobrescrita acidental nos scripts | **SIM** | Não |
| Validação empírica em ambiente descartável de teste local | **SIM** | Não |
| Redação e atualização deste playbook operacional | **SIM** | Não |
| Provisionamento de infraestrutura de banco (RDS, Cloud SQL, Neon, etc.) | Não | **SIM** |
| Configuração de rotinas automatizadas de snapshot em nuvem (Point-in-Time Recovery) | Não | **SIM** |
| Armazenamento off-site e políticas de retenção em bucket seguro com criptografia | Não | **SIM** |
| Gerenciamento seguro de credenciais em secrets manager / KMS | Não | **SIM** |
| Testes de recuperação de desastre no ambiente de nuvem antes do lançamento oficial | Não | **SIM** |

---

## 7. Política Sugerida de Retenção (Para Implementação na Nuvem)

Recomenda-se que o operador de infraestrutura configure a seguinte política no bucket de armazenamento externo:

- **Backups Diários:** Retenção por 30 dias com exclusão automática após o período.
- **Backups Semanais (Domingos):** Retenção por 12 semanas (3 meses).
- **Backups Mensais (1º dia do mês):** Retenção por 12 meses.
- **Backups Anuais:** Retenção permanente ou por 5 anos (atendimento a exigências fiscais e societárias).
- **Imutabilidade (Object Lock):** Habilitar WORM (Write Once, Read Many) nos buckets de backup para proteção contra ransomware.

---

## 8. Evidências Exigidas Antes da Hospedagem em Produção

Antes que o sistema seja liberado para usuários reais, as seguintes evidências devem ser registradas pelo operador:

- [ ] Execução bem-sucedida do script `pnpm run db:backup` com arquivo de dump gerado;
- [ ] Execução bem-sucedida do script `pnpm run db:restore` em banco descartável de homologação;
- [ ] Confirmação de que todas as tabelas e dados do banco restaurado estão íntegros;
- [ ] Validação do endpoint `GET /api/health?check=ready` retornando `status: ok, database: connected`;
- [ ] Comprovação de que nenhuma credencial ou chave privada vazou para os arquivos de log.

---

## 9. Checklist Operacional Rápido

Antes de qualquer migração ou manutenção crítica:
- [ ] 1. Executar `pnpm run db:backup -- --output backups/pre_deploy.sql`;
- [ ] 2. Confirmar tamanho do arquivo `pre_deploy.sql` > 0 bytes;
- [ ] 3. Realizar restauração de teste em banco descartável com `pnpm run db:restore`;
- [ ] 4. Prosseguir com a manutenção autorizada;
- [ ] 5. Verificar o health check após a manutenção: `curl http://localhost:3000/api/health?check=ready`.
