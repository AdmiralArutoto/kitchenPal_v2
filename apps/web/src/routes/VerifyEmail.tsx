import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import Button from '../components/Button';

export default function VerifyEmail() {
  const { user, isVerified, resendVerification, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isVerified) navigate('/home', { replace: true });
  }, [isVerified, navigate]);

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
  }, [user, navigate]);

  async function handleResend() {
    setStatus('sending');
    setErrorMessage(null);
    const result = await resendVerification();
    if (result.error) {
      setStatus('error');
      setErrorMessage(result.error);
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card padding="lg" className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-semibold text-text-default">Check your email</h1>
        <p className="mt-3 text-sm text-text-muted">
          We sent a verification link to{' '}
          <span className="font-medium text-text-default">{user?.email ?? 'your email'}</span>.
          Click the link to activate your account.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button type="button" onClick={handleResend} disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent — check again' : 'Resend link'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => signOut().then(() => navigate('/'))}>
            Use a different email
          </Button>
        </div>
        {status === 'error' && errorMessage && (
          <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
        )}
      </Card>
    </main>
  );
}
