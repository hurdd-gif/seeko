'use server';

import { revalidatePath } from 'next/cache';

/** Revalidate dashboard layout so profile (e.g. avatar) updates show in Sidebar and all dashboard pages. */
export async function revalidateDashboard() {
  revalidatePath('/settings', 'layout');
  revalidatePath('/', 'layout');
}
