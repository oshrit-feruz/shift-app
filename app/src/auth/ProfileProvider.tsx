import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { EMPTY_PROFILE, mergeProfile, type ProfileOverrides, type UserProfile } from './profile';

/** Outcome of a profile edit, in the same honest shape as DeleteResult. */
export type SaveResult = { ok: true } | { ok: false; reason: { en: string; he: string } };

interface ProfileState {
  /** The provider's identity with the user's own choices applied on top. */
  profile: UserProfile;
  /** True once the overrides row has been read, so the editor can wait. */
  loaded: boolean;
  /** Whether each field is currently the user's choice rather than the provider's. */
  hasCustomName: boolean;
  hasCustomAvatar: boolean;
  /** Pass null to clear the override and fall back to the provider's name. */
  saveDisplayName: (name: string | null) => Promise<SaveResult>;
  uploadAvatar: (file: File) => Promise<SaveResult>;
  removeAvatar: () => Promise<SaveResult>;
}

const ProfileCtx = createContext<ProfileState | null>(null);

const SAVE_FAILED = {
  en: 'The change was not saved. Nothing was altered — you can try again.',
  he: 'השינוי לא נשמר. שום דבר לא השתנה — אפשר לנסות שוב.',
};

const UPLOAD_FAILED = {
  en: 'The picture was not uploaded. It may be too large, or not a JPEG, PNG or WebP.',
  he: 'התמונה לא הועלתה. ייתכן שהיא גדולה מדי, או שאינה JPEG, PNG או WebP.',
};

const BUCKET = 'avatars';

/** Extension for the stored object, from the file's real MIME type rather
 *  than its filename — a renamed .txt must not become a .png on the server. */
function extensionFor(type: string): string | null {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return null;
}

/**
 * Merges the provider's identity with the user's own edits, and owns the
 * writes that change them.
 *
 * Two separate concerns share this provider because they share a lifecycle:
 * on every sign-in the provider's current identity is pushed *into* the
 * profiles row (people rename themselves in Google, and the signup trigger
 * fires only once), and the user's overrides are read *out* of it. Keeping
 * them apart in the schema is what stops the first from undoing the second.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session, profile: identity } = useAuth();
  const userId = session.status === 'ok' && session.data ? session.data.user.id : null;
  const [overrides, setOverrides] = useState<ProfileOverrides>({ displayName: null, avatarUrl: null });
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const syncedFor = useRef<string | null>(null);

  const publicUrl = useCallback(
    (path: string | null) =>
      path && supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null,
    [],
  );

  useEffect(() => {
    if (!userId || !supabase) {
      // Signed out: drop the previous user's overrides so nothing of theirs
      // survives into the next session on this device.
      syncedFor.current = null;
      setOverrides({ displayName: null, avatarUrl: null });
      setAvatarPath(null);
      setLoaded(false);
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    let cancelled = false;
    const client = supabase;
    // Push the provider's current identity in and read the user's own
    // choices back out — one round trip, not two: PostgREST returns the
    // updated row directly, and this runs on the critical path of every
    // sign-in.
    client
      .from('profiles')
      .update({
        email: identity.email,
        full_name: identity.fullName,
        avatar_url: identity.avatarUrl,
        locale: identity.locale,
      })
      .eq('id', userId)
      .select('display_name, avatar_path')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Could not read the overrides. Show the provider's identity rather
          // than blocking the app, but leave `loaded` false so the editor
          // does not offer to save on top of state it never saw.
          console.warn('profile read failed', error.message);
          return;
        }
        const path = (data?.avatar_path as string | null) ?? null;
        setAvatarPath(path);
        setOverrides({
          displayName: (data?.display_name as string | null) ?? null,
          avatarUrl: publicUrl(path),
        });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the user, not on `identity`: this runs once per sign-in, and
    // the identity object is rebuilt on every session refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, publicUrl]);

  const value = useMemo<ProfileState>(() => {
    const saveDisplayName = async (name: string | null): Promise<SaveResult> => {
      if (!supabase || !userId) return { ok: false, reason: SAVE_FAILED };
      const next = name?.trim() ? name.trim() : null;
      const { error } = await supabase.from('profiles').update({ display_name: next }).eq('id', userId);
      if (error) return { ok: false, reason: SAVE_FAILED };
      setOverrides((o) => ({ ...o, displayName: next }));
      return { ok: true };
    };

    const uploadAvatar = async (file: File): Promise<SaveResult> => {
      if (!supabase || !userId) return { ok: false, reason: UPLOAD_FAILED };
      const ext = extensionFor(file.type);
      if (!ext) return { ok: false, reason: UPLOAD_FAILED };
      // Timestamped name: the public URL therefore changes on every upload,
      // so a replaced picture appears immediately instead of being served
      // from the CDN cache under its old URL.
      const previous = avatarPath;
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
      });
      if (uploadError) return { ok: false, reason: UPLOAD_FAILED };
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
      if (error) {
        // The row still points at the old picture, so the just-uploaded file
        // is unreferenced; remove it rather than leaving an orphan behind.
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, reason: SAVE_FAILED };
      }
      setAvatarPath(path);
      setOverrides((o) => ({ ...o, avatarUrl: publicUrl(path) }));
      // Best-effort cleanup of the replaced file: failing to delete it costs
      // storage, not correctness, so it must not fail the save.
      if (previous) await supabase.storage.from(BUCKET).remove([previous]);
      return { ok: true };
    };

    const removeAvatar = async (): Promise<SaveResult> => {
      if (!supabase || !userId) return { ok: false, reason: SAVE_FAILED };
      const previous = avatarPath;
      const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
      if (error) return { ok: false, reason: SAVE_FAILED };
      setAvatarPath(null);
      setOverrides((o) => ({ ...o, avatarUrl: null }));
      if (previous) await supabase.storage.from(BUCKET).remove([previous]);
      return { ok: true };
    };

    return {
      profile: userId ? mergeProfile(identity, overrides) : EMPTY_PROFILE,
      loaded,
      hasCustomName: overrides.displayName != null,
      hasCustomAvatar: avatarPath != null,
      saveDisplayName,
      uploadAvatar,
      removeAvatar,
    };
  }, [identity, overrides, avatarPath, loaded, userId, publicUrl]);

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
