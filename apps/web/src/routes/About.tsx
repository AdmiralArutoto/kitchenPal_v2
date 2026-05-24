import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import type { ProfileResponse } from '../types/api';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import FormField from '../components/FormField';
import Pill from '../components/Pill';

const FEATURES = [
  'AI-powered recipe generation tailored to your preferences',
  'Personal recipe vault with smart organization',
  'Modify existing recipes using AI suggestions',
  'Smart serving scaler for ingredient amounts',
  'Tag-based filtering and search',
];

export default function About() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [newPref, setNewPref] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    apiFetch<ProfileResponse>('/api/profile')
      .then((p) => {
        setProfile(p);
        setNameDraft(p.name ?? '');
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load profile');
        setLoading(false);
      });
  }, []);

  async function saveName() {
    if (!profile) return;
    setSavingName(true);
    setError(null);
    try {
      const updated = await apiFetch<ProfileResponse>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: nameDraft.trim() || null }),
      });
      setProfile(updated);
      setEditingName(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save name');
    } finally {
      setSavingName(false);
    }
  }

  async function updatePrefs(next: string[]) {
    if (!profile) return;
    const prev = profile.preferences;
    setProfile({ ...profile, preferences: next });
    setSavingPrefs(true);
    setError(null);
    try {
      const updated = await apiFetch<ProfileResponse>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ preferences: next }),
      });
      setProfile(updated);
    } catch (err) {
      setProfile({ ...profile, preferences: prev });
      setError(err instanceof ApiError ? err.message : 'Failed to update preferences');
    } finally {
      setSavingPrefs(false);
    }
  }

  function addPref() {
    const trimmed = newPref.trim();
    if (!trimmed || !profile) return;
    if (profile.preferences.includes(trimmed)) {
      setNewPref('');
      return;
    }
    setNewPref('');
    void updatePrefs([...profile.preferences, trimmed]);
  }

  function removePref(pref: string) {
    if (!profile) return;
    void updatePrefs(profile.preferences.filter((p) => p !== pref));
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[896px] px-6 pt-12 pb-20">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[896px] px-6 pt-12 pb-20">
        <p className="text-sm text-red-600">{error ?? 'Profile not available'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-8 px-6 pt-12 pb-20">
      {error && (
        <Card variant="bordered" padding="sm" className="border-red-300 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {/* Account Info card */}
      <Card variant="bordered" padding="lg">
        <div className="flex items-center gap-3 border-b border-black/10 pb-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-primary">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-text-default">Account Info</h2>
            <p className="text-sm text-text-muted">Manage your personal information</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {/* Display Name */}
          <FormField label="Display Name">
            {({ id }) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  value={editingName ? nameDraft : (profile.name ?? '')}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={!editingName}
                  placeholder="Your name"
                />
                {editingName ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveName}
                      disabled={savingName}
                    >
                      {savingName ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(profile.name ?? '');
                      }}
                      disabled={savingName}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingName(true)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            )}
          </FormField>

          {/* Email */}
          <FormField label="Email" hint="Email cannot be changed">
            {({ id }) => (
              <Input
                id={id}
                value={profile.email ?? ''}
                disabled
                className="bg-bg-page"
              />
            )}
          </FormField>

          {/* Dietary Preferences */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-default">Dietary Preferences</label>
            <p className="text-sm text-text-muted">
              These preferences will be used to personalize your AI recipe suggestions
            </p>
            {profile.preferences.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.preferences.map((pref) => (
                  <Pill key={pref} onRemove={() => removePref(pref)}>
                    {pref}
                  </Pill>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Vegan, Keto, Dairy-free…"
                value={newPref}
                onChange={(e) => setNewPref(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPref();
                  }
                }}
                disabled={savingPrefs}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addPref}
                disabled={savingPrefs || !newPref.trim()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mr-1"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* About KitchenPal card */}
      <Card variant="bordered" padding="lg">
        <h2 className="border-b border-black/10 pb-4 text-2xl font-semibold text-text-default">
          About KitchenPal
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-base text-text-body">
            <span className="font-bold">KitchenPal</span> is your personal recipe management
            companion, designed to help you discover, organize, and create delicious recipes with
            the power of AI.
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-text-default">Features:</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-body">
              {FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1 border-t border-black/10 pt-4 text-sm text-text-muted">
            <p>
              <span className="font-bold">Version:</span> 1.0.0
            </p>
            <p>
              <span className="font-bold">Purpose:</span> Private recipe management with AI
              assistance
            </p>
            <p className="italic">Your recipes are private and only visible to you.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
