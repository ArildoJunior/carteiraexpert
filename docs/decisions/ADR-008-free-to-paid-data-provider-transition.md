# ADR-008 — Estratégia de Provedores de Dados de Mercado e Transição de Fontes

## Status

Aceito — implementação parcial.

## Contexto

A consolidação patrimonial exige dados de cotações, histórico de preços, taxas de câmbio e proventos. No lançamento e fases iniciais, a plataforma poderá adotar fontes públicas, gratuitas ou de faixa gratuita, as quais frequentemente apresentam limitações de estabilidade, limites de requisições, defasagem temporal, cobertura restrita ou restrições de licenciamento para redistribuição comercial.

Conforme a evolução do produto e as exigências operacionais, será necessária a contratação e integração de provedores pagos de dados de mercado com maior confiabilidade e acordos de nível de serviço (SLA).

## Decisão

1. **Adoção Progressiva de Provedores:** O produto utilizará inicialmente provedores gratuitos ou com faixa gratuita, quando técnica e juridicamente permitido. Provedores pagos poderão substituir ou complementar os gratuitos quando o negócio exigir maior cobertura, estabilidade, volume ou qualidade.
2. **Encapsulamento por Adaptadores:** Toda integração com fontes de dados deve ser realizada exclusivamente por meio de implementações concretas do contrato abstrato `MarketDataProviderAdapter`.
3. **Desacoplamento Rigoroso dos Motores:** Os motores de cálculo patrimonial (`position-engine`, `valuation-engine`, `portfolio-evolution-engine`) não poderão depender diretamente de fornecedores específicos. A troca ou adição de um fornecedor de dados não deverá exigir alteração nos motores de domínio nem no contrato interno de consumo dos dados.
4. **Metadados de Rastreabilidade e Qualidade:** Cada registro de mercado persistido internamente deverá armazenar fonte (`source`), data/hora de referência em UTC (`quoteDate` / `rateDate`), moeda, qualidade e status de defasagem (`delayStatus`).
5. **Segurança de Credenciais:** Tokens e chaves de API devem permanecer estritamente fora do controle de versão. A simples presença de nomes de variáveis em arquivos de exemplo (ex.: `.env.example`) não constitui prova de integração funcional no código.
6. **Governança de Licenças e Uso Comercial:** O uso comercial, a licença de uso e a permissão formal de redistribuição dos dados deverão ser expressamente verificados antes da ativação de qualquer provedor em ambiente de produção. Enquanto a licença ou a origem não estiverem confirmadas, os dados deverão ser classificados como `não verificado` e não poderão ser tratados como fonte consolidada para publicação.

## Estado Atual da Implementação

- **`ManualPayloadAdapter`:** Implementado e validado para ingestão estruturada sob demanda;
- **`MockProviderAdapter`:** Implementado e validado para testes unitários e de integração;
- **`BrapiAdapter`:** Implementado e validado como conector para a API pública da BRAPI, consumido via script administrativo CLI (`scripts/ingest-market-data.ts`);
- **Persistência Local Relacional:** Implementada e validada nas tabelas `market_quotes` e `exchange_rates`;
- **Sincronização Automática em Background (Cron Jobs):** Não implementada (planejada no roadmap);
- **Streaming / WebSocket:** Não implementado;
- **Migração para Provedores Pagos:** Decisão aprovada, com contratação e implementação futura conforme expansão de volume e exigências de SLA.

## Consequências

### Positivas

- Troca e adição de fornecedores de mercado com zero impacto nos motores de cálculo financeiro;
- Proteção da aplicação contra instabilidades, mudanças de layout ou descontinuação de APIs externas;
- Transparência para o usuário sobre a data de referência, defasagem e qualidade dos dados exibidos;
- Conformidade jurídica e regulatória através da checagem obrigatória de licenças.

### Negativas / Riscos

- Necessidade de manter camadas de normalização de tickers, moedas e fusos horários UTC para cada novo provedor;
- Necessidade de monitoramento contínuo de qualidade e consistência entre diferentes fontes.