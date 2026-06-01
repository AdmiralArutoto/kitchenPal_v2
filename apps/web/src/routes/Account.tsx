import { useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import FormField from '../components/FormField';
import Pill from '../components/Pill';

// Account page (reached from the nav avatar menu). Holds the personal info moved out of About —
// display name, email, dietary preferences — plus an avatar uploader. The avatar URL is stored in
// Supabase auth user_metadata (so it rides in the session and shows in the nav immediately).
export default function Account() {
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useProfile();
  const updateMutation = useUpdateProfile();
  const { showToast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [newPref, setNewPref] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const initial = (profile?.name?.trim()?.[0] ?? user?.email?.[0] ?? '?').toUpperCase();

  function startEditName() {
    setNameDraft(profile?.name ?? '');
    setEditingName(true);
  }
  function saveName() {
    if (!profile) return;
    updateMutation.mutate({ name: nameDraft.trim() || null });
    setEditingName(false);
  }
  function addPref() {
    const trimmed = newPref.trim();
    if (!trimmed || !profile) return;
    setNewPref('');
    if (profile.preferences.includes(trimmed)) return;
    updateMutation.mutate({ preferences: [...profile.preferences, trimmed] });
  }
  function removePref(pref: string) {
    if (!profile) return;
    updateMutation.mutate({ preferences: profile.preferences.filter((p) => p !== pref) });
  }

  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (avatarUrl) fd.append('previous', avatarUrl);
      const { avatarUrl: url } = await apiFetch<{ avatarUrl: string }>('/api/profile/avatar', {
        method: 'POST',
        body: fd,
      });
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      showToast('Avatar updated', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to upload avatar', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    if (uploading || !avatarUrl) return;
    setUploading(true);
    try {
      await supabase.auth.updateUser({ data: { avatar_url: null } });
      showToast('Avatar removed', 'success');
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[896px] px-6 pt-12 pb-20">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[896px] px-6 pt-12 pb-20">
        <p className="text-sm text-danger">{error?.message ?? 'Profile not available'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[896px] flex-col gap-8 px-6 pt-12 pb-20">
      <Card variant="bordered" padding="lg">
        <div className="flex items-center gap-3 border-b border-black/10 pb-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <div>
            <h2 className="font-serif text-2xl font-semibold text-text-default">Account</h2>
            <p className="text-sm text-text-muted">Manage your personal information</p>
          </div>
        </div>

        {/* Avatar */}
        <div className="mt-6 flex items-center gap-4">
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border-subtle">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-accent-soft text-2xl font-semibold text-accent-text">
                {initial}
              </span>
            )}
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onAvatarPicked}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={uploading}
                  className="inline-flex h-8 items-center rounded-lg border border-border-subtle bg-bg-card px-3 text-sm font-medium text-danger hover:bg-bg-toggle disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted">PNG, JPG or WEBP, up to 4MB.</p>
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
                    <Button type="button" size="sm" onClick={saveName}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(profile.name ?? '');
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={startEditName}>
                    Edit
                  </Button>
                )}
              </div>
            )}
          </FormField>

          {/* Email */}
          <FormField label="Email" hint="Email cannot be changed">
            {({ id }) => (
              <Input id={id} value={profile.email ?? ''} disabled className="bg-bg-page" />
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
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addPref}
                disabled={!newPref.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
