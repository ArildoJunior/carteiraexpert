import { describe, it, expect } from 'vitest';
import {
  CvmMatchingEngine,
  inferExpectedShareClass,
  normalizeCvmShareClass,
  normalizeCnpjDigits,
  normalizeCvmCodeDigits,
} from '@/modules/market-data/domain/cvm-matching-engine';
import type {
  CanonicalAssetMatchingInput,
  CvmCompanyMatchingInput,
  CvmSecurityMappingInput,
  ExistingBindingMatchingInput,
} from '@/modules/market-data/domain/cvm-matching.types';

describe('CvmMatchingEngine — Motor Puro de Matching Determinístico', () => {
  const sampleWegCompany: CvmCompanyMatchingInput = {
    id: 'comp-weg-uuid',
    cvmCode: '005410',
    cnpj: '84429695000111',
    legalName: 'WEG S.A.',
    tradeName: 'WEG',
    industrySector: 'MÁQUINAS E EQUIPAMENTOS',
    status: 'ATIVO',
  };

  const samplePetrobrasCompany: CvmCompanyMatchingInput = {
    id: 'comp-petr-uuid',
    cvmCode: '009512',
    cnpj: '33000167000101',
    legalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
    tradeName: 'PETROBRAS',
    industrySector: 'PETRÓLEO E GÁS',
    status: 'ATIVO',
  };

  const sampleInactiveCompany: CvmCompanyMatchingInput = {
    id: 'comp-inactive-uuid',
    cvmCode: '099999',
    cnpj: '11222333000199',
    legalName: 'COMPANHIA ANTIGA S.A. - EM LIQUIDAÇÃO',
    status: 'CANCELADA',
  };

  const sampleWegMapping: CvmSecurityMappingInput = {
    cvmCode: '005410',
    cnpj: '84429695000111',
    ticker: 'WEGE3',
    securityType: 'AÇÕES',
    shareClass: 'ON',
    isin: 'BRWEGEACNOR0',
  };

  // 1. Correspondência exata de ticker, CNPJ/CVM e classe (APPROVED_CANDIDATE)
  it('1. deve retornar APPROVED_CANDIDATE para correspondência exata de ticker, CNPJ/CVM e classe compatível', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [sampleWegMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-wege3-uuid',
      ticker: 'WEGE3',
      name: 'WEG - ON  ATZ NM',
      assetType: 'stock',
      isin: 'BRWEGEACNOR0',
    };

    const result = engine.evaluateAsset(asset);

    expect(result.decision).toBe('APPROVED_CANDIDATE');
    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.requiresHumanReview).toBe(false);
    expect(result.candidateCompany?.cvmCode).toBe('005410');
    expect(result.candidateCompany?.cnpj).toBe('84429695000111');
    expect(result.expectedShareClass).toBe('ON');
    expect(result.provenShareClass).toBe('ON');
    expect(result.matchMethod).toBe('OFFICIAL_SECURITY_MAPPING');
  });

  // 2. Ticker exato sem CNPJ/CVM comprovante (PENDING_REVIEW)
  it('2. deve retornar PENDING_REVIEW quando houver mapeamento de ticker mas sem companhia ativa cadastrada', () => {
    const engine = new CvmMatchingEngine({
      companies: [], // Nenhuma companhia cadastrada
      securityMappings: [sampleWegMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-wege3-uuid',
      ticker: 'WEGE3',
      name: 'WEG - ON',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 3. ISIN isolado sem correspondência cadastral (PENDING_REVIEW, nunca APPROVED)
  it('3. deve garantir que ISIN isolado nunca gere aprovação automática', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [], // Sem mapeamento oficial FCA/CVM
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-unknown-uuid',
      ticker: 'XYZW3',
      name: 'Empresa Desconhecida',
      assetType: 'stock',
      isin: 'BRXYZWACNOR0',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.decision).not.toBe('APPROVED_CANDIDATE');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.evidences).toContain('ISIN_PRESENT_NO_FCA_MAPPING');
  });

  // 4. Raiz de ticker coincidente com companhia incorreta
  it('4. deve rejeitar aprovação automática quando houver apenas raiz de ticker sem correspondência comprovada', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-wege-fake-uuid',
      ticker: 'WEGE4', // WEG só tem ON (WEGE3), WEGE4 não existe na CVM
      name: 'WEG FAKE PN',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).not.toBe('APPROVED_CANDIDATE');
  });

  // 5. Similaridade textual sem evidência oficial
  it('5. deve garantir que similaridade textual nunca gere aprovação automática', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-text-sim-uuid',
      ticker: 'WEGA3',
      name: 'WEG AUTOMACAO E SISTEMAS S.A.',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).not.toBe('APPROVED_CANDIDATE');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 6. Múltiplos candidatos CVM (Ambiguidade -> PENDING_REVIEW)
  it('6. deve retornar PENDING_REVIEW com justificativa de ambiguidade quando houver múltiplos emissores CVM para o mesmo ticker', () => {
    const anotherCompany: CvmCompanyMatchingInput = {
      id: 'comp-another-uuid',
      cvmCode: '008888',
      cnpj: '99888777000100',
      legalName: 'OUTRA COMPANHIA HOLDING S.A.',
      status: 'ATIVO',
    };

    const conflictingMapping1: CvmSecurityMappingInput = {
      cvmCode: '005410',
      cnpj: '84429695000111',
      ticker: 'AMBG3',
      shareClass: 'ON',
    };

    const conflictingMapping2: CvmSecurityMappingInput = {
      cvmCode: '008888',
      cnpj: '99888777000100',
      ticker: 'AMBG3',
      shareClass: 'ON',
    };

    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany, anotherCompany],
      securityMappings: [conflictingMapping1, conflictingMapping2],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-ambg3-uuid',
      ticker: 'AMBG3',
      name: 'Ambiguidade Teste',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.evidences).toContain('MULTIPLE_CVM_COMPANIES_FOR_TICKER');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 7. Companhia CVM cancelada / inativa (PENDING_REVIEW)
  it('7. deve retornar PENDING_REVIEW quando a companhia CVM associada estiver com status CANCELADA', () => {
    const inactiveMapping: CvmSecurityMappingInput = {
      cvmCode: '099999',
      cnpj: '11222333000199',
      ticker: 'OLD3',
      shareClass: 'ON',
    };

    const engine = new CvmMatchingEngine({
      companies: [sampleInactiveCompany],
      securityMappings: [inactiveMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-old3-uuid',
      ticker: 'OLD3',
      name: 'Companhia Antiga',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.evidences).toContain('CVM_COMPANY_INACTIVE');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 8. Divergência de classe de ação (PENDING_REVIEW)
  it('8. deve retornar PENDING_REVIEW quando houver divergência entre classe esperada (ON) e comprovada (PN)', () => {
    const divergentMapping: CvmSecurityMappingInput = {
      cvmCode: '005410',
      cnpj: '84429695000111',
      ticker: 'WEGE3',
      shareClass: 'PN', // Divergência: ticker termina em 3 (espera ON), mas mapping indica PN
    };

    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [divergentMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-wege3-uuid',
      ticker: 'WEGE3',
      name: 'WEG',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.evidences).toContain('SHARE_CLASS_DIVERGENCE');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 9. Ticker final 11 sem comprovação de unit (PENDING_REVIEW)
  it('9. deve retornar PENDING_REVIEW para ticker terminado em 11 sem evidência explícita de Unit de ações', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-amb11-uuid',
      ticker: 'TEST11',
      name: 'Ativo Final 11 Sem Especificacao',
      assetType: 'stock',
      bdiCode: '99', // Não é lote padrão de ações 02
      specification: '',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.evidences).toContain('SUFFIX_11_AMBIGUOUS');
    expect(result.requiresHumanReview).toBe(true);
  });

  // 10. FII fora do escopo (OUT_OF_SCOPE)
  it('10. deve classificar FIIs rigorosamente como OUT_OF_SCOPE', () => {
    const engine = new CvmMatchingEngine({
      companies: [samplePetrobrasCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-knip11-uuid',
      ticker: 'KNIP11',
      name: 'FII KINEA IP - CI',
      assetType: 'fii',
      isin: 'BRKNIPCTF001',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('OUT_OF_SCOPE');
    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.requiresHumanReview).toBe(false);
  });

  // 11. ETF fora do escopo (OUT_OF_SCOPE)
  it('11. deve classificar ETFs rigorosamente como OUT_OF_SCOPE', () => {
    const engine = new CvmMatchingEngine({
      companies: [],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-bova11-uuid',
      ticker: 'BOVA11',
      name: 'ISHARES BOVA - CI',
      assetType: 'etf',
      isin: 'BRBOVACTF001',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('OUT_OF_SCOPE');
    expect(result.confidenceLevel).toBe('HIGH');
  });

  // 12. BDR fora do escopo (OUT_OF_SCOPE)
  it('12. deve classificar BDRs rigorosamente como OUT_OF_SCOPE', () => {
    const engine = new CvmMatchingEngine({
      companies: [],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-aapl34-uuid',
      ticker: 'AAPL34',
      name: 'APPLE - BDR',
      assetType: 'bdr',
      isin: 'BRAAPLBDR004',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('OUT_OF_SCOPE');
    expect(result.confidenceLevel).toBe('HIGH');
  });

  // 13. Criptoativo fora do escopo (OUT_OF_SCOPE)
  it('13. deve classificar criptoativos genéricos como OUT_OF_SCOPE', () => {
    const engine = new CvmMatchingEngine({
      companies: [],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-eth-uuid',
      ticker: 'ETH',
      name: 'Ethereum',
      assetType: 'crypto',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('OUT_OF_SCOPE');
    expect(result.confidenceLevel).toBe('HIGH');
  });

  // 14. Proteção do BTC (OUT_OF_SCOPE)
  it('14. deve proteger estritamente o ativo BTC contra qualquer proposta de matching CVM', () => {
    const engine = new CvmMatchingEngine({
      companies: [samplePetrobrasCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: '81161538-bb79-4f5b-bd33-4791596e167f',
      ticker: 'BTC',
      name: 'Bitcoin',
      assetType: 'crypto',
      market: 'CRYPTO',
      isin: null,
      provenance: 'curated_seed',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('OUT_OF_SCOPE');
    expect(result.evidences).toContain('REGULATORY_OUT_OF_SCOPE');
    expect(result.requiresHumanReview).toBe(false);
  });

  // 15. Preservação de vínculo CURATED_SEED (PROTECTED_EXISTING_BINDING)
  it('15. deve preservar intactos vínculos previamente homologados com CURATED_SEED', () => {
    const existingBinding: ExistingBindingMatchingInput = {
      id: 'bind-petr4-uuid',
      assetId: 'asset-petr4-uuid',
      ticker: 'PETR4',
      companyId: 'comp-petr-uuid',
      cvmCode: '009512',
      cnpj: '33000167000101',
      shareClass: 'PN',
      status: 'APPROVED',
      matchMethod: 'CURATED_SEED',
      source: 'cvm_seed_2024',
    };

    const engine = new CvmMatchingEngine({
      companies: [samplePetrobrasCompany],
      securityMappings: [],
      existingBindings: [existingBinding],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-petr4-uuid',
      ticker: 'PETR4',
      name: 'PETROBRAS - PN',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PROTECTED_EXISTING_BINDING');
    expect(result.matchMethod).toBe('CURATED_SEED');
    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.requiresHumanReview).toBe(false);
  });

  // 16. Ausência total de correspondência (NO_MATCH)
  it('16. deve retornar NO_MATCH para ações sem nenhum registro correspondente na CVM', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-unkn3-uuid',
      ticker: 'UNKN3',
      name: 'Empresa Sem Registro CVM',
      assetType: 'stock',
      isin: null,
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('NO_MATCH');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.candidateCompany).toBeNull();
  });

  // 17. Ticker com reorganização societária (PENDING_REVIEW)
  it('17. deve encaminhar tickers com reorganização societária ou cisão para PENDING_REVIEW', () => {
    const reorgCompany: CvmCompanyMatchingInput = {
      id: 'comp-reorg-uuid',
      cvmCode: '007777',
      cnpj: '77666555000144',
      legalName: 'COMPANHIA EM CISÃO S.A.',
      status: 'SUSPENSO(A) - DECISÃO ADM',
    };

    const reorgMapping: CvmSecurityMappingInput = {
      cvmCode: '007777',
      cnpj: '77666555000144',
      ticker: 'REOR3',
      shareClass: 'ON',
    };

    const engine = new CvmMatchingEngine({
      companies: [reorgCompany],
      securityMappings: [reorgMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-reor3-uuid',
      ticker: 'REOR3',
      name: 'Empresa em Reorganizacao',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);
    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.evidences).toContain('CVM_COMPANY_INACTIVE');
  });

  // 18. Resultado determinístico para a mesma entrada
  it('18. deve garantir resultado estritamente idêntico e determinístico para repetidas invocações com a mesma entrada', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [sampleWegMapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-wege3-uuid',
      ticker: 'WEGE3',
      name: 'WEG',
      assetType: 'stock',
      isin: 'BRWEGEACNOR0',
    };

    const res1 = engine.evaluateAsset(asset);
    const res2 = engine.evaluateAsset(asset);

    expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
  });

  // 19. Ausência de qualquer operação de banco ou rede
  it('19. deve operar de forma 100% pura em memória sem I/O', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [sampleWegMapping],
    });

    const assetsList: CanonicalAssetMatchingInput[] = [
      { id: '1', ticker: 'WEGE3', name: 'WEG', assetType: 'stock' },
      { id: '2', ticker: 'KNIP11', name: 'Kinea', assetType: 'fii' },
      { id: '3', ticker: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
    ];

    const batchResult = engine.evaluateBatch(assetsList);
    expect(batchResult.totalAssetsEvaluated).toBe(3);
    expect(batchResult.approvedCandidates).toBe(1);
    expect(batchResult.outOfScope).toBe(2);
  });

  // 20. Garantia de que nenhum caso heurístico retorna aprovação
  it('20. deve garantir que nenhum caso de inferência heurística retorne APPROVED_CANDIDATE', () => {
    const engine = new CvmMatchingEngine({
      companies: [sampleWegCompany],
      securityMappings: [], // Sem prova cadastral oficial
    });

    const heuristicAssets: CanonicalAssetMatchingInput[] = [
      { id: '1', ticker: 'WEGE3', name: 'WEG NOME APROXIMADO', assetType: 'stock', isin: 'BRWEGEACNOR0' },
      { id: '2', ticker: 'WEGE4', name: 'WEG PN', assetType: 'stock' },
      { id: '3', ticker: 'WEGE11', name: 'WEG UNT', assetType: 'stock' },
    ];

    const batch = engine.evaluateBatch(heuristicAssets);
    expect(batch.approvedCandidates).toBe(0);
    for (const r of batch.results) {
      expect(r.decision).not.toBe('APPROVED_CANDIDATE');
    }
  });

  // Testes auxiliares de normalizadores puros
  describe('Normalizadores e Funções Utilitárias Puras', () => {
    it('deve inferir classes esperadas por sufixo de ticker', () => {
      expect(inferExpectedShareClass('PETR3')).toBe('ON');
      expect(inferExpectedShareClass('PETR4')).toBe('PN');
      expect(inferExpectedShareClass('VALE5')).toBe('PNA');
      expect(inferExpectedShareClass('ELET6')).toBe('PNB');
      expect(inferExpectedShareClass('TAEE11')).toBe('UNT');
      expect(inferExpectedShareClass('BTC')).toBeNull();
    });

    it('deve normalizar classes CVM textuais', () => {
      expect(normalizeCvmShareClass('ON')).toBe('ON');
      expect(normalizeCvmShareClass('Ordinária')).toBe('ON');
      expect(normalizeCvmShareClass('PREFERENCIAL')).toBe('PN');
      expect(normalizeCvmShareClass('PREF A')).toBe('PNA');
      expect(normalizeCvmShareClass('PREF B')).toBe('PNB');
      expect(normalizeCvmShareClass('Unit')).toBe('UNT');
      expect(normalizeCvmShareClass(null)).toBeNull();
    });

    it('deve normalizar CNPJ para 14 dígitos e Código CVM para 6 dígitos', () => {
      expect(normalizeCnpjDigits('84.429.695/0001-11')).toBe('84429695000111');
      expect(normalizeCnpjDigits('123')).toBe('00000000000123');
      expect(normalizeCvmCodeDigits('5410')).toBe('005410');
      expect(normalizeCvmCodeDigits('005410')).toBe('005410');
    });
  });
});
