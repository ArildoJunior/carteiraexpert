# Apoio Tributário e Relatórios Auxiliares de IRPF

Este documento estabelece as diretrizes, fronteiras, limites regulatórios e a implementação do módulo fiscal e relatórios auxiliares de IRPF no CarteiraExpert (**Etapa 9**).

---

## 1. Limites Regulatórios e Vedações Permanentes

A plataforma possui finalidade estritamente informativa, descritiva e organizacional:

1. **Não Emissão de DARF:** O CarteiraExpert **nunca emite DARF**, não calcula códigos de barras para recolhimento e não processa pagamentos de tributos.
2. **Não Substituição Profissional:** As informações geradas não substituem a atuação de contadores, auditores fiscais ou profissionais habilitados registrados no CRC.
3. **Não Elaboração/Transmissão de Declaração Oficial:** A plataforma não preenche nem transmite a Declaração de Ajuste Anual do IRPF para a Receita Federal do Brasil (sem integração com e-CAC ou Meu Imposto de Renda).
4. **Responsabilidade do Contribuinte:** O usuário é o único responsável pela veracidade e confirmação das informações declaradas ao fisco.

> **Aviso Regulatório Obrigatório:**  
> "Este módulo é exclusivamente auxiliar e informativo. Não substitui o cálculo oficial de um(a) contador(a) ou da Receita Federal. O CarteiraExpert NÃO emite DARF, NÃO integra com a Receita Federal e NÃO gera declaração oficial. O usuário é o único responsável pela veracidade das informações declaradas ao fisco."

---

## 2. Arquitetura e Estrutura do Módulo (`src/modules/tax/`)

O módulo fiscal foi implementado como uma camada desacoplada que consome a timeline factual existente (`portfolio_events` e `cash_transactions`) como fonte imutável de verdade, sem criar tabelas intermediárias de movimentação financeira.

```
src/modules/tax/
├── domain/
│   ├── tax.types.ts           # Modelos de domínio, resumos mensais e fichas IRPF
│   ├── errors.ts              # Erros de domínio (datas no futuro, concorrência, etc.)
│   ├── tax.schema.ts          # Validações Zod com Decimal e limites regulatórios
│   ├── tax-engine.ts          # Motor matemático puro determinístico em Decimal
│   ├── tax.serializer.ts      # Serialização segura para Server Actions
│   └── index.ts
├── server/
│   ├── tax.service.ts         # Orquestração server-side, anti-IDOR e auditoria transacional
│   ├── tax.actions.ts         # Server Actions Next.js para interface gráfica
│   └── index.ts
└── ui/
    ├── TaxDisclaimerBanner.tsx     # Banner regulatório com id="tax-regulatory-disclaimer"
    ├── TaxPreferencesModal.tsx     # Modal de parametrização de alíquotas e isenção
    ├── TaxMonthlyReportCard.tsx    # Card e detalhamento de operações mensais
    ├── TaxAnnualReportView.tsx     # Visão anual integrada com abas de fichas IRPF
    ├── TaxDashboardView.tsx        # Orquestrador da rota /fiscal
    └── index.ts
```

---

## 3. Regras Fiscais e Metodologia de Cálculo

1. **Cálculo de Preço Médio de Aquisição:**
   - Preço médio ponderado contínuo atualizado a cada operação de compra (`BUY`), considerando taxas e emolumentos incorridos.
   - Ajuste em eventos corporativos: Desdobramentos (`SPLIT`) e Grupamentos (`GROUPING`) alteram a quantidade e o preço unitário médio sem alterar o custo total de aquisição. Bonificações (`BONUS_SHARE`) agregam quantidade e custo econômico atribuído.
2. **Apuração Mensal de Ganho Líquido:**
   - Confronto entre o valor líquido da venda (`SELL` deduzidas as taxas) e o custo médio ponderado da posição alienada.
   - Agregação por classe de ativo: Ações, Fundos Imobiliários (FIIs), ETFs e BDRs.
3. **Isenção de R$ 20.000,00 para Ações (IN RFB 2054/2024):**
   - Vendas de ações no mês civil $\le$ R$ 20.000,00: ganho líquido é isento de imposto.
   - **Regra de não compensação:** perdas apuradas em meses isentos ($\le$ R$ 20k) não geram crédito nem compensam ganhos futuros.
   - Vendas de ações no mês civil $>$ R$ 20.000,00: ganho líquido é tributável à alíquota padrão (15% padrão, parametrizável).
4. **Fundos Imobiliários (FIIs):**
   - Ganho de capital em vendas apurado separadamente.
   - Rendimentos mensais distribuídos por FIIs são informados como isentos na declaração de pessoa física (IN RFB 1585/2015) e não integram a base de ganho de capital de alienação.
5. **Day-Trade:**
   - Identificação automática de operações intradiárias (compra e venda do mesmo ativo no mesmo dia civil).
   - Alíquota de 20% sobre o ganho líquido, independentemente do volume total de vendas no mês (sem isenção de 20k).
6. **Compensação de Prejuízos Acumulados (FIFO):**
   - Prejuízos apurados em meses tributáveis de mercado à vista são registrados na tabela `tax_loss_credits`.
   - Compensação em ordem cronológica (FIFO) contra ganhos tributáveis futuros da mesma modalidade por até 5 anos-calendário subsequentes.
7. **Proventos (Dividendos e JCP):**
   - Dividendos comuns de ações: isentos de IRRF e de imposto na declaração de pessoa física residente.
   - Juros sobre Capital Próprio (JCP): apuração com separação entre valor bruto, retenção de 15% de IRRF na fonte pagadora e valor líquido creditado.

---

## 4. Fichas Auxiliares de Declaração IRPF Geradas

- **Ficha Bens e Direitos:** Posição de custódia física e custo total de aquisição em 31/12 do ano-base, acompanhada de texto descritivo padronizado para cópia manual pelo contribuinte.
- **Ficha Rendimentos Isentos e Não Tributáveis:** Totalização anual de dividendos e proventos de FIIs recebidos, além de ganhos de capital de meses isentos ($\le$ R$ 20k).
- **Ficha Rendimentos Sujeitos à Tributação Exclusiva/Definitiva:** Totalização de JCP com detalhamento de valor bruto, IRRF retido e valor líquido.
- **Controle de Prejuízos Acumulados:** Tabela demonstrativa de créditos de prejuízo com ano/mês de origem, saldo remanescente e prazo decadencial de 5 anos.

---

## 5. Matriz de Estado das Capacidades Tributárias

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Cálculo factual de PnL realizado por venda | Implementado | **Implementado e validado** |
| Cálculo de IRRF retido na fonte sobre JCP (15%) | Implementado | **Implementado e validado** |
| Identificação de proventos isentos (dividendos e FIIs) | Implementado | **Implementado e validado** |
| Módulo dedicado de apuração mensal e fechamento fiscal | Implementado (`src/modules/tax`) | **Implementado e validado** |
| Isenção mensal de R$ 20k para ações com trava de não-compensação | Implementado (`tax-engine.ts`) | **Implementado e validado** |
| Compensação de prejuízos fiscais em 5 anos (FIFO) | Implementado (`tax_loss_credits`) | **Implementado e validado** |
| Relatórios anuais auxiliares de IRPF (Bens e Direitos / Rendimentos) | Implementado (`TaxAnnualReportView.tsx`) | **Implementado e validado** |
| Parametrização de alíquotas e isenção em preferências | Implementado (`TaxPreferencesModal.tsx`) | **Implementado e validado** |
| Exportação em CSV e impressão/PDF para o usuário | Implementado | **Implementado e validado** |
| Emissão de guias de recolhimento (DARF) e pagamentos | Não suportado | **Fora do escopo permanente** |
| Preenchimento / transmissão oficial de IRPF | Não suportado | **Fora do escopo permanente** |