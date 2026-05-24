import { useToast } from '../contexts/ToastContext';
import Toast from './Toast';

export default function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-6 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast message={t.message} kind={t.kind} onDismiss={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
