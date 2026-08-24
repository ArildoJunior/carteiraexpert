import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listCommercialPlans, getPlanQuotaSummary } from '@/modules/plans/server/plan.service';
import { getBillingGroupOverview } from '@/modules/plans/server/group.service';
import { getUserBillingSummary } from '@/modules/billing/server/billing.service';
import { PlansView } from '@/modules/plans/ui/PlansView';

export const metadata: Metadata = {
  title: 'Planos e Quotas — CarteiraExpert',
  description: 'Conheça os limites de carteiras, recursos e condições comerciais dos planos do CarteiraExpert.',
};

export default async function PlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [plans, quotaSummary, billingSummary, groupOverview] = await Promise.all([
    listCommercialPlans(),
    getPlanQuotaSummary(user.id),
    getUserBillingSummary(user.id),
    getBillingGroupOverview(user.id, user.email),
  ]);

  return (
    <PlansView
      plans={plans}
      quotaSummary={quotaSummary}
      billingSummary={billingSummary}
      groupOverview={groupOverview}
    />
  );
}
