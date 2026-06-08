import { redirect } from 'next/navigation';

// The Issues board now lives at the dashboard root (`/`). This route is kept as a
// redirect so existing deep-links (e.g. `/tasks?task=<id>` stored in older
// notifications) continue to resolve to the board.
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { task } = await searchParams;
  redirect(task ? `/?task=${task}` : '/');
}
