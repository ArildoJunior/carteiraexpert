import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import {
  getUserTaxPreferences,
  executeTaxCalculation,
} from '@/modules/tax/server/tax.service';
import {
  serializeUserTaxPreferences,
  serializeTaxAnnualReport,
} from '@/modules/tax/domain/tax.serializer';
import { TaxDashboardView } from '@/modules/tax/ui/TaxDashboardView';

export const metadata: Metadata = {
  title: 'Módulo Fiscal e Apoio ao IRPF | CarteiraExpert',
  description:
    'Camada descritiva, informativa e auxiliar de apoio à declaração de IRPF para mercado à vista, FIIs, JCP, dividendos e controle de prejuízos.',
  openGraph: {
    title: 'Módulo Fiscal e Apoio ao IRPF | CarteiraExpert',
    description:
      'Camada descritiva, informativa e auxiliar de apoio à declaração de IRPF para mercado à vista, FIIs, JCP, dividendos e controle de prejuízos.',
  },
};

export default async function FiscalPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const currentYear = new Date().getFullYear();

  // Carrega preferências e carteiras do usuário
  const [prefs, userPortfolios] = await Promise.all([
    getUserTaxPreferences(user),
    listPortfolios(user),
  ]);

  // Executa apuração inicial para o ano corrente
  let initialReport;
  try {
    const report = await executeTaxCalculation(user, {
      year: currentYear,
      forceRecalculate: false,
    });
    initialReport = serializeTaxAnnualReport(report);
  } catch {
    // Caso ocorra erro de concorrência ou outro bloqueio, calcula fallback vazio
    const { calculateAnnualTax } = await import('@/modules/tax/domain/tax-engine');
    const fallback = calculateAnnualTax([], currentYear, [], prefs);
    initialReport = serializeTaxAnnualReport(fallback);
  }

  const portfolioOptions = userPortfolios.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
      <TaxDashboardView
        initialReport={initialReport}
        initialPreferences={serializeUserTaxPreferences(prefs)}
        portfolios={portfolioOptions}
        currentYear={currentYear}
      />
    </div>
  );
}
