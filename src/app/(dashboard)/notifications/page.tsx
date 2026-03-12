import { NotificationsPanel } from '@/components/dashboard/NotificationsPanel';
import { FadeRise } from '@/components/motion';

export default function NotificationsPage() {
  return (
    <FadeRise delay={0} y={16}>
      <NotificationsPanel />
    </FadeRise>
  );
}
