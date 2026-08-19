# Segurança e Governança de Dados (LGPD)

Este documento estabelece as diretrizes de segurança da informação, privacidade e governança de dados pessoais e financeiros da plataforma CarteiraExpert.

## 1. Princípios de Segurança e Privacidade

- **Privacy by Design e Security by Design:** Segurança e privacidade como requisitos estruturais desde a modelagem de dados.
- **Menor Privilégio e Minimização de Dados:** Coleta e armazenamento restritos ao estritamente necessário para o funcionamento do serviço.
- **Isolamento entre Usuários:** As consultas e operações analisadas utilizam o identificador autenticado do usuário para restringir o acesso aos dados. A cobertura completa de todas as rotas e serviços deve permanecer sujeita à validação contínua.
- **Rastreabilidade e auditoria de alterações relevantes.**

## 2. Controles de Segurança Implementados e Validados

### 2.1. Autenticação e Gestão de Credenciais
- **Hash de Senhas:** Utilização obrigatória do algoritmo Argon2id com parâmetros seguros de memória e iterações (`src/modules/identity/server/password.service.ts`). Senhas em texto puro nunca são persistidas ou logadas.
- **Sessões Seguras:** O token de sessão gerado em texto puro trafega exclusivamente via cookie `HttpOnly`, `Secure` e `SameSite=Lax`. No banco de dados (`sessions`), armazena-se apenas o hash SHA-256 do token.
- **Proteção contra Força Bruta (Rate Limiting):** Controle de tentativas de autenticação implementado de forma stateless no banco (`authRateLimits`) utilizando chaves derivadas de HMAC-SHA256, permitindo escalabilidade horizontal sem perda de estado.
- **Redefinição de Senha:** Tokens de uso único com validade estrita de 15 minutos e consumo atômico no banco.

### 2.2. Consentimentos LGPD
- **Registro Append-Only (`user_consents`):** Aceites de termos de uso, políticas de privacidade e avisos legais são persistidos com versão, IP e data/hora. A tabela é protegida por trigger no PostgreSQL que impede operações de `UPDATE` e `DELETE`.

### 2.3. Trilha de Auditoria
- **Tabela `audit_logs`:** A tabela `audit_logs` registra alterações e eventos auditáveis com ator, correlação e snapshots do estado anterior e posterior, conforme os fluxos que utilizam o mecanismo de auditoria. A imutabilidade física e a proteção contra alterações diretas devem ser confirmadas no schema e nas políticas do banco.

## 3. Controles Planejados para Fases Futuras

Os seguintes controles representam diretrizes arquiteturais para módulos ainda não implementados:

- **Armazenamento Privado de Documentos:** Quando o módulo de importações/documentos for implementado, notas de corretagem e extratos em PDF deverão ser armazenados em bucket privado com acesso restrito via URLs temporárias assinadas com tempo de expiração curto (*Planejado, não implementado*).
- **Validação Segura de Arquivos:** Verificação estrita de MIME-type real, sanitização de metadados e limite de tamanho no processamento de uploads (*Planejado, não implementado*).
- **MFA (Autenticação Multifator):** Suporte a TOTP/WebAuthn (*Planejado, não implementado*).
- **Gestão Integrada de Incidentes:** Protocolos automatizados de contenção, comunicação e análise pós-incidente (*Planejado*).

## 4. Governança em Planos Compartilhados (Regras Aprovadas)

- **Isolamento de Dados no Grupo:** A assinatura compartilhada é estritamente um mecanismo comercial de rateio de custos de software.
- **Vedação de Acesso Financeiro:** O titular pagante **não recebe qualquer permissão técnica** para visualizar, editar, exportar ou inferir carteiras, ativos, extratos, posições, relatórios tributários ou documentos dos membros convidados.
- **Estado da Implementação:** Essa é uma regra de negócio e arquitetural aprovada. A infraestrutura comercial de convites e gestão de membros ainda está com implementação pendente.