import { describe, it, expect } from 'vitest';
import { CvmMatchingEngine } from '@/modules/market-data/domain/cvm-matching-engine';
import type {
  CanonicalAssetMatchingInput,
  CvmCompanyMatchingInput,
  CvmSecurityMappingInput,
} from '@/modules/market-data/domain/cvm-matching.types';

describe('CvmMatchingEngine — Resolução Determinística por Raiz de 4 Letras', () => {
  const azulCompany: CvmCompanyMatchingInput = {
    id: 'azul-comp-uuid',
    cvmCode: '024112',
    cnpj: '09305994000129',
    legalName: 'AZUL S.A.',
    status: 'ATIVO',
  };

  const axiaCompany: CvmCompanyMatchingInput = {
    id: 'axia-comp-uuid',
    cvmCode: '002437',
    cnpj: '00001180000126',
    legalName: 'AXIA ENERGIA S.A.',
    status: 'ATIVO',
  };

  const azul3Mapping: CvmSecurityMappingInput = {
    cvmCode: '024112',
    cnpj: '09305994000129',
    ticker: 'AZUL3',
    shareClass: 'ON',
  };

  const axia3Mapping: CvmSecurityMappingInput = {
    cvmCode: '002437',
    cnpj: '00001180000126',
    ticker: 'AXIA3',
    shareClass: 'ON',
  };

  it('deve resolver deterministicamente AZUL4 quando apenas AZUL3 constar no FCA da CVM', () => {
    const engine = new CvmMatchingEngine({
      companies: [azulCompany],
      securityMappings: [azul3Mapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-azul4-uuid',
      ticker: 'AZUL4',
      name: 'AZUL - PN',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);

    expect(result.decision).toBe('APPROVED_CANDIDATE');
    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.requiresHumanReview).toBe(false);
    expect(result.candidateCompany?.cvmCode).toBe('024112');
    expect(result.candidateCompany?.legalName).toBe('AZUL S.A.');
    expect(result.expectedShareClass).toBe('PN');
    expect(result.provenShareClass).toBe('PN');
    expect(result.matchMethod).toBe('HEURISTIC');
    expect(result.evidences).toContain('CVM_ROOT_DETERMINISTIC_MATCH');
  });

  it('deve resolver deterministicamente AXIA6 quando apenas AXIA3 constar no FCA da CVM', () => {
    const engine = new CvmMatchingEngine({
      companies: [axiaCompany],
      securityMappings: [axia3Mapping],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-axia6-uuid',
      ticker: 'AXIA6',
      name: 'AXIA ENERGIA - PNB',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);

    expect(result.decision).toBe('APPROVED_CANDIDATE');
    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.requiresHumanReview).toBe(false);
    expect(result.candidateCompany?.cvmCode).toBe('002437');
    expect(result.candidateCompany?.legalName).toBe('AXIA ENERGIA S.A.');
    expect(result.expectedShareClass).toBe('PNB');
    expect(result.provenShareClass).toBe('PNB');
    expect(result.matchMethod).toBe('HEURISTIC');
  });

  it('deve retornar PENDING_REVIEW quando uma raiz de 4 letras convergir para múltiplas companhias distintas', () => {
    const companyA: CvmCompanyMatchingInput = {
      id: 'comp-a-uuid',
      cvmCode: '011111',
      cnpj: '11111111000111',
      legalName: 'TEST HOLDING A S.A.',
      status: 'ATIVO',
    };

    const companyB: CvmCompanyMatchingInput = {
      id: 'comp-b-uuid',
      cvmCode: '022222',
      cnpj: '22222222000122',
      legalName: 'TEST HOLDING B S.A.',
      status: 'ATIVO',
    };

    const mappingA: CvmSecurityMappingInput = {
      cvmCode: '011111',
      cnpj: '11111111000111',
      ticker: 'TEST3',
    };

    const mappingB: CvmSecurityMappingInput = {
      cvmCode: '022222',
      cnpj: '22222222000122',
      ticker: 'TEST11',
    };

    const engine = new CvmMatchingEngine({
      companies: [companyA, companyB],
      securityMappings: [mappingA, mappingB],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-test4-uuid',
      ticker: 'TEST4',
      name: 'TEST - PN',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);

    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.evidences).toContain('MULTIPLE_CVM_COMPANIES_FOR_ROOT');
  });

  it('deve reter em PENDING_REVIEW se a companhia CVM resolvida por raiz estiver com status inativo', () => {
    const inactiveCompany: CvmCompanyMatchingInput = {
      id: 'comp-old-uuid',
      cvmCode: '033333',
      cnpj: '33333333000133',
      legalName: 'COMPANHIA ANTIGA S.A.',
      status: 'CANCELADA',
    };

    const mappingOld: CvmSecurityMappingInput = {
      cvmCode: '033333',
      cnpj: '33333333000133',
      ticker: 'OLDC3',
    };

    const engine = new CvmMatchingEngine({
      companies: [inactiveCompany],
      securityMappings: [mappingOld],
    });

    const asset: CanonicalAssetMatchingInput = {
      id: 'asset-oldc4-uuid',
      ticker: 'OLDC4',
      name: 'COMPANHIA ANTIGA - PN',
      assetType: 'stock',
    };

    const result = engine.evaluateAsset(asset);

    expect(result.decision).toBe('PENDING_REVIEW');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.evidences).toContain('CVM_COMPANY_INACTIVE');
  });
});
