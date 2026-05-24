import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthCard from '../components/AuthCard';
import TabToggle from '../components/TabToggle';
import FormField from '../components/FormField';
import Input from '../components/Input';
import Button from '../components/Button';

type Mode = 'login' | 'signup';

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    const result = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(mode === 'login' ? '/home' : '/verify-email');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthCard>
        <TabToggle
          options={[
            { value: 'login', label: 'Login' },
            { value: 'signup', label: 'Sign Up' },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Email">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
          </FormField>
          <FormField label="Password">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            )}
          </FormField>
          {mode === 'signup' && (
            <FormField label="Confirm Password">
              {({ id }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              )}
            </FormField>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create Account'}
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
