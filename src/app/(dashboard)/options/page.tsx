import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import { searchAssets } from '@/modules/portfolio/server/asset.service';
import { getCustodyAccountsByPortfolio } from '@/modules/portfolio/server/custody.service';
import {
  listUserOptions,
  getUserOptionAlerts,
} from '@/modules/options/server/options.service';
import {
  serializeOptionContract,
  serializeOptionProximityAlert,
} from '@/modules/options/domain/options.serializer';
import { OptionsDashboardView } from '@/modules/options/ui/OptionsDashboardView';

export const metadata: Metadata = {
  title: 'Módulo Operacional de Opções | CarteiraExpert',
  description:
    'Controle descritivo de contratos de opções, cálculo de gregas informativas por Black-Scholes, curvas de payoff e alertas de vencimento da B3.',
  openGraph: {
    title: 'Módulo Operacional de Opções | CarteiraExpert',
    description:
      'Controle descritivo de contratos de opções, cálculo de gregas informativas por Black-Scholes, curvas de payoff e alertas de vencimento da B3.',
  },
};

export default async function OptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Consulta paralela dos dados iniciais
  const [userOptions, alerts, userPortfolios, visibleAssets] = await Promise.all([
    listUserOptions(user),
    getUserOptionAlerts(user),
    listPortfolios(user),
    searchAssets({ query: '' }, user),
  ]);

  // Consultar contas de custódia para cada carteira
  const custodyAccountsList: Array<{ id: string; name: string; portfolioId: string }> = [];
  await Promise.all(
    userPortfolios.map(async (p) => {
      try {
        const accs = await getCustodyAccountsByPortfolio(p.id, user);
        for (const a of accs) {
          custodyAccountsList.push({
            id: a.id,
            name: `${a.institution.name} — ${a.name}`,
            portfolioId: p.id,
          });
        }
      } catch {
        // Sem contas
      }
    })
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
      <OptionsDashboardView
        initialOptions={userOptions.map(serializeOptionContract)}
        initialAlerts={alerts.map(serializeOptionProximityAlert)}
        portfolios={userPortfolios.map((p) => ({ id: p.id, name: p.name }))}
        assets={visibleAssets.map((a) => ({ id: a.id, ticker: a.ticker, name: a.name }))}
        custodyAccounts={custodyAccountsList}
      />
    </div>
  );
}
