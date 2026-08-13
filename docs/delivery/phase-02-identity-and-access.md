# Fase 02 — Identidade, Acesso e Isolamento

## Objetivo

Garantir que usuários tenham acesso apenas aos próprios dados antes da criação de carteiras.

## Pacote 02.01 — Cadastro, login e sessão

### Incluído

- Cadastro;
- Login;
- Logout;
- Hash de senha com Argon2;
- Sessões;
- Recuperação de senha, se definida tecnicamente;
- Perfil básico;
- Rate limiting inicial;
- Validação com Zod.

### Fora do escopo

- Planos;
- Convites;
- Carteiras;
- MFA completo;
- Cobrança.

### Critérios de aceite

- [x] Usuário consegue criar conta;
- [x] Senha não é armazenada em texto puro (Argon2id com parâmetros OWASP);
- [x] Sessão inválida não acessa área privada;
- [x] Entradas inválidas são rejeitadas (validação Zod Unicode-aware);
- [x] Há testes de autenticação (unitários, integração e E2E).

## Pacote 02.02 — Consentimentos, autorização e isolamento

### Incluído

- Aceite de termos;
- Aceite de política de privacidade;
- Registro de consentimentos;
- Middleware de autorização;
- Estrutura de papéis internos;
- Auditoria de ações sensíveis;
- Testes de acesso horizontal indevido.

### Fora do escopo

- Plano compartilhado;
- Entitlements Premium;
- Dados de carteira.

### Critérios de aceite

- [ ] Consentimentos são persistidos com versão e data;
- [ ] Usuário A não acessa recurso privado do usuário B;
- [ ] Rotas privadas exigem autenticação;
- [ ] Tentativas indevidas são tratadas;
- [ ] Há testes de autorização.