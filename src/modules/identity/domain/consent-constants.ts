export const CURRENT_CONSENT_VERSIONS = {
  terms_of_service: {
    version: '1.0',
    documentType: 'terms_of_service',
    required: true,
    title: 'Termos de Uso',
    path: '/terms',
  },
  privacy_policy: {
    version: '1.0',
    documentType: 'privacy_policy',
    required: true,
    title: 'Política de Privacidade',
    path: '/privacy',
  },
  marketing_communications: {
    version: '1.0',
    documentType: 'marketing_communications',
    required: false,
    title: 'Comunicações de Marketing',
    path: null,
  },
} as const;

export type ConsentDocumentType = keyof typeof CURRENT_CONSENT_VERSIONS;
