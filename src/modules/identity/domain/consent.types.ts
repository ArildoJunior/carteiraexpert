import { ConsentDocumentType } from './consent-constants';

export type ConsentAction = 'granted' | 'revoked';

export interface RecordConsentOptions {
  userId: string;
  consentType: ConsentDocumentType;
  version: string;
  action: ConsentAction;
  ip: string | undefined;
  userAgent: string | undefined;
  correlationId?: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentDocumentType;
  version: string;
  action: ConsentAction;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: Date;
}
