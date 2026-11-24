import { CreditCard } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supportsNativeCollector } from '../../utils/nativeCollector';

export function CollectorTripLink({ trip }) {
  const { user, isMockMode } = useAuth();
  if (!supportsNativeCollector() || isMockMode || !user?.id || user.isGuest) return null;

  // The native WebView handles a user-initiated top-level navigation to this path.
  return (
    <a href={`/_app/collector/connect/${encodeURIComponent(trip.id)}`}
      aria-label={`이 여행에 카드 연결 (${trip.title})`}
      className="relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary-light px-4 py-3 text-sm font-bold text-primary-dark hover:bg-primary">
      <CreditCard className="h-4 w-4" aria-hidden="true" />
      이 여행에 카드 연결
    </a>
  );
}
