export interface CustodyInstitution {
  id: string;
  name: string;
  code: string | null;
  country: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface CustodyAccount {
  id: string;
  portfolioId: string;
  institutionId: string;
  name: string;
  accountNumber: string | null;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CustodyAccountWithInstitution extends CustodyAccount {
  institution: CustodyInstitution;
}

export interface SerializedCustodyInstitution {
  id: string;
  name: string;
  code: string | null;
  country: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface SerializedCustodyAccount {
  id: string;
  portfolioId: string;
  institutionId: string;
  name: string;
  accountNumber: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  institution?: SerializedCustodyInstitution;
}
