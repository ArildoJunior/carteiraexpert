import crypto from 'node:crypto';
import { db } from './client';
import { auditLogs } from './schema/audit';
import { Decimal } from '../decimal';

// Lista de campos confidenciais e credenciais que devem ser totalmente removidos
const PROHIBITED_AUDIT_FIELDS = new Set([
  'password', 'password_hash', 'salt', 'token', 'access_token',
  'refresh_token', 'api_key', 'secret', 'private_key', 'credential',
  'session_id', 'auth_code', 'pin', 'cvv'
]);

export interface AuditLogOptions {
  tableName: string;
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'REVERSAL' | 'ADJUSTMENT';
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'job' | null;
  correlationId?: string | null;
  reason?: string | null;
  source?: 'manual' | 'import' | 'job' | 'migration' | null;
}

export interface SanitizerOptions {
  allowlist?: string[];
  allowedNumbers?: string[];
  preMinimized?: boolean;
}

const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB
const MAX_STRING_LENGTH = 1000;

export function sanitizeValue(
  value: any,
  options: SanitizerOptions,
  path: string[] = [],
  seen = new Set<any>()
): any {
  if (value === null) return null;
  if (value === undefined) return undefined;

  // Detecção de referências cíclicas para evitar recursão infinita
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Referência cíclica detectada no payload de auditoria.');
    }
    seen.add(value);
  }

  // Conversão de Decimal para string
  if (value instanceof Decimal) {
    return value.toString();
  }

  // Conversão de Date para string ISO 8601
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Validação e higienização de string
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(
        `String excessivamente longa no campo "${path.join('.')}": limite de ${MAX_STRING_LENGTH} caracteres excedido.`
      );
    }
    return value;
  }

  // Permissão direta de booleanos
  if (typeof value === 'boolean') {
    return value;
  }

  // Validação rígida de números (evita floats financeiros silenciosos)
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new Error(`Valor NaN detectado no campo "${path.join('.')}".`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Valor infinito detectado no campo "${path.join('.')}".`);
    }

    const fieldName = path[path.length - 1];
    const isAllowedNumber = options.allowedNumbers?.includes(fieldName);
    if (!isAllowedNumber) {
      throw new Error(
        `Uso incorreto de tipo number no campo "${path.join('.')}". Valores financeiros devem ser representados como string ou Decimal. Números não-financeiros devem estar em allowedNumbers.`
      );
    }
    return value;
  }

  // Rejeição de tipos não suportados/inadequados
  if (typeof value === 'bigint') {
    throw new Error(`Tipo bigint detectado no campo "${path.join('.')}". Não é serializável nativamente.`);
  }

  if (value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))) {
    throw new Error(`Payload binário (Buffer/Uint8Array) detectado no campo "${path.join('.')}". Blobs e documentos completos são proibidos.`);
  }

  // Arrays recursivos
  if (Array.isArray(value)) {
    const sanitizedArray: any[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = sanitizeValue(value[i], options, [...path, i.toString()], seen);
      if (item !== undefined) {
        sanitizedArray.push(item);
      }
    }
    seen.delete(value);
    return sanitizedArray;
  }

  // Objetos recursivos
  if (typeof value === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      // 1. Remoção primária de campos proibidos por correspondência exata
      if (PROHIBITED_AUDIT_FIELDS.has(key.toLowerCase())) {
        continue;
      }

      // 2. Filtro de allowlist no primeiro nível (exceto se em preMinimized explícito)
      if (!options.preMinimized && options.allowlist && path.length === 0) {
        if (!options.allowlist.includes(key)) {
          continue;
        }
      }

      const val = sanitizeValue(value[key], options, [...path, key], seen);
      if (val !== undefined) {
        sanitizedObj[key] = val;
      }
    }
    seen.delete(value);
    return sanitizedObj;
  }

  throw new Error(`Tipo de dado não suportado no campo "${path.join('.')}": ${typeof value}`);
}

export function sanitizePayload(payload: any, options: SanitizerOptions): any {
  if (!options.preMinimized && !options.allowlist) {
    throw new Error(
      'O sanitizador de auditoria exige uma allowlist por padrão, exceto se preMinimized estiver configurado.'
    );
  }

  const result = sanitizeValue(payload, options);

  // Validação rígida do tamanho serializado
  const serialized = JSON.stringify(result);
  if (serialized && serialized.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Payload de auditoria excessivamente grande: tamanho total de ${serialized.length} bytes excede o limite de ${MAX_PAYLOAD_SIZE} bytes.`
    );
  }

  return result;
}

/**
 * Função de auditoria estritamente append-only.
 * Não existem métodos para atualizar ou apagar registros de auditoria no código da aplicação.
 */
const VALID_ACTIONS = new Set(['INSERT', 'UPDATE', 'DELETE', 'REVERSAL', 'ADJUSTMENT']);

export async function insertAuditLog(
  log: AuditLogOptions,
  payloads?: {
    oldValue?: any;
    newValue?: any;
  },
  options: SanitizerOptions = {},
  executor: any = db
): Promise<void> {
  if (!log.tableName) {
    throw new Error('O campo tableName é obrigatório para registrar auditoria.');
  }
  if (!log.recordId) {
    throw new Error('O campo recordId é obrigatório para registrar auditoria.');
  }
  if (!log.action || !VALID_ACTIONS.has(log.action)) {
    throw new Error(`Ação de auditoria inválida: "${log.action}".`);
  }

  const sanitizedOld = payloads?.oldValue !== undefined
    ? sanitizePayload(payloads.oldValue, options)
    : null;

  const sanitizedNew = payloads?.newValue !== undefined
    ? sanitizePayload(payloads.newValue, options)
    : null;

  // Geração do UUID na aplicação (Opção B)
  const id = crypto.randomUUID();

  await executor.insert(auditLogs).values({
    id,
    tableName: log.tableName,
    recordId: log.recordId,
    action: log.action,
    actorId: log.actorId || null,
    actorType: log.actorType || null,
    correlationId: log.correlationId ? log.correlationId : null,
    oldValue: sanitizedOld,
    newValue: sanitizedNew,
    reason: log.reason || null,
    source: log.source || null,
  });
}
