'use server';

import { revalidatePath } from 'next/cache';

/** Revalidate investor layout so profile updates show in InvestorSidebar and investor pages. */
export async function revalidateInvestor() {
  revalidatePath('/investor/settings', 'layout');
  revalidatePath('/investor', 'layout');
}
