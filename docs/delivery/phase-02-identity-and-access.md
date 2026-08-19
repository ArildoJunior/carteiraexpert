# Fase 02 — Identidade, Acesso e Segurança

## Objetivo

Garantir autenticação robusta, gestão segura de credenciais, controle de sessões e governança LGPD antes da criação de carteiras financeiras.

## Pacote 02.01 — Cadastro, Login e Sessões

### Incluído e Comprovado

- Cadastro de usuários com e-mail único e validação Zod;
- Hash de senhas via **Argon2id** com parâmetros alinhados às recomendações OWASP;
- Login e autenticação com validação estrita no servidor;
- Sessões persistidas no banco (`sessions`) com identificador armazenado em hash **SHA-256** e cookies seguros (`HttpOnly`, `SameSite=Lax`, `Secure`);
- Logout com encerramento de sessão no banco e auditoria;
- Redefinição atômica de senha via tokens temporários de uso único em `password_reset_tokens`;
- Rate limiting stateless em `auth_rate_limits` utilizando HMAC-SHA256 para prevenção de ataques de força bruta.

### Fora do Escopo deste Pacote

- Autenticação multifator (MFA/2FA) por aplicativo ou SMS (planejada para o roadmap futuro);
- Planos comerciais e assinaturas;
- Gestão de carteiras financeiras.

### Critérios de Aceite

- [x] Usuário cria conta com validação de dados no servidor;
- [x] Senha não é trafegada nem armazenada em texto puro (Argon2id);
- [x] Sessões utilizam cookies protegidos e tokens em hash SHA-256 no banco;
- [x] Tentativas excessivas de login são mitigadas por controle de taxa;
- [x] Redefinição de senha opera de forma segura e atômica;
- [x] Suítes de testes unitários, integração e E2E aprovadas para autenticação.

## Pacote 02.02 — Consentimentos LGPD, Autorização e Isolamento

### Incluído e Comprovado

- Tabela `user_consents` para registro formal de aceite de Termos de Uso e Política de Privacidade;
- Trigger PostgreSQL *append-only* que impede atualização ou exclusão física de registros de consentimento;
- Middleware e validação de autenticação em Server Actions e Server Components;
- As rotas e operações analisadas utilizam o identificador autenticado do usuário para restringir o acesso aos dados. A cobertura completa de todas as rotas e serviços permanece sujeita à validação contínua;
- Registro de auditoria em `audit_logs` para eventos de segurança relevantes.

### Fora do Escopo deste Pacote

- Planos compartilhados e gestão de grupos familiares (Fase 05);
- Entitlements comerciais;
- Compartilhamento de dados entre usuários (vedado pelas regras de produto e arquitetura).

### Critérios de Aceite

- [x] Consentimentos LGPD são persistidos com versão, timestamp UTC e trigger *append-only*;
- [x] As rotas e operações analisadas validam `userId` autenticado no servidor para restringir o acesso aos dados;
- [x] Rotas privadas e Server Actions rejeitam requisições não autenticadas;
- [x] Testes de consentimento e probes de isolamento horizontal aprovados nas suítes analisadas.