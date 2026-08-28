import { useRef, useState, type ChangeEvent } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useProfile } from '../auth/ProfileProvider';
import { isValidDisplayName, DISPLAY_NAME_MAX } from '../auth/profile';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Lets the user replace what the provider said about them.
 *
 * Both fields are overrides rather than edits: clearing one falls back to the
 * Google value instead of leaving a blank, which is why each has an explicit
 * "use my Google …" action rather than expecting the user to empty a field
 * and guess what happens.
 *
 * The email is shown but not editable, and says so. It is the identity the
 * account is keyed on — changing it here would either be a lie (a label over
 * an unchanged login) or a way to lock yourself out.
 */
export function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, hasCustomName, hasCustomAvatar, saveDisplayName, uploadAvatar, removeAvatar } =
    useProfile();
  const t = useT();
  const { language } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.fullName ?? '');
  const [busy, setBusy] = useState<'name' | 'photo' | null>(null);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const nameChanged = name.trim() !== (profile.fullName ?? '').trim();
  const nameValid = name.trim() === '' || isValidDisplayName(name);

  const run = async (kind: 'name' | 'photo', action: () => Promise<{ ok: boolean; reason?: { en: string; he: string } }>) => {
    setBusy(kind);
    setError(null);
    setSaved(false);
    const result = await action();
    if (!result.ok) setError(result.reason ?? null);
    else setSaved(true);
    setBusy(null);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires a change.
    e.target.value = '';
    if (file) void run('photo', () => uploadAvatar(file));
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('set.editProfile')}>
      {/* Picture */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            width={56}
            height={56}
            referrerPolicy="no-referrer"
            style={{ borderRadius: '50%', flex: 'none', objectFit: 'cover' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              flex: 'none',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
            }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              fontSize={13}
              minHeight={36}
              disabled={busy != null}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'photo' ? t('set.uploading') : t('set.changePhoto')}
            </Button>
            {hasCustomAvatar && (
              <Button
                variant="ghost"
                fontSize={13}
                minHeight={36}
                disabled={busy != null}
                onClick={() => void run('photo', removeAvatar)}
              >
                {t('set.useProviderPhoto')}
              </Button>
            )}
          </div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {t('set.photoHelp')}
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {/* Display name */}
      <div className="field">
        <label htmlFor="display-name" style={{ fontSize: 13 }}>
          {t('set.displayName')}
        </label>
        <input
          id="display-name"
          className="input"
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={t('set.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
        {!nameValid && (
          <span style={{ fontSize: 12, color: 'var(--down)' }}>{t('set.nameInvalid')}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          fontSize={13}
          minHeight={38}
          disabled={busy != null || !nameChanged || !nameValid}
          onClick={() => void run('name', () => saveDisplayName(name.trim() === '' ? null : name))}
        >
          {busy === 'name' ? t('set.saving') : t('set.save')}
        </Button>
        {hasCustomName && (
          <Button
            variant="ghost"
            fontSize={13}
            minHeight={38}
            disabled={busy != null}
            onClick={() => {
              setName('');
              void run('name', () => saveDisplayName(null));
            }}
          >
            {t('set.useProviderName')}
          </Button>
        )}
      </div>

      {/* Email — shown, not editable, and says why. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--color-divider)', paddingTop: 10 }}>
        <span style={{ fontSize: 13.5 }}>{profile.email}</span>
        <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {t('set.emailFixed')}
        </span>
      </div>

      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 13.5 }}>{t('set.saveFailedTitle')}</span>
          <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {error[language]}
          </span>
        </div>
      )}
      {saved && !error && (
        <span role="status" className="text-muted" style={{ fontSize: 12.5 }}>
          {t('set.saved')}
        </span>
      )}
    </Sheet>
  );
}
