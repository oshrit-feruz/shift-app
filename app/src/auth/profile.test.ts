import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { EMPTY_PROFILE, localeToLanguage, readProfile } from './profile';

const user = (email: unknown, meta: Record<string, unknown>) =>
  ({ email, user_metadata: meta } as unknown as User);

describe('readProfile', () => {
  it('reads a typical Google identity', () => {
    expect(
      readProfile(
        user('noa@gmail.com', {
          full_name: 'נועה כהן',
          avatar_url: 'https://lh3.googleusercontent.com/a/x',
          email: 'noa@gmail.com',
        }),
      ),
    ).toEqual({
      email: 'noa@gmail.com',
      fullName: 'נועה כהן',
      firstName: 'נועה',
      avatarUrl: 'https://lh3.googleusercontent.com/a/x',
      locale: null,
    });
  });

  it('falls back to the alternate provider key names', () => {
    const p = readProfile(user('a@b.com', { name: 'Ada Lovelace', picture: 'https://x/y.png' }));
    expect(p.fullName).toBe('Ada Lovelace');
    expect(p.firstName).toBe('Ada');
    expect(p.avatarUrl).toBe('https://x/y.png');
  });

  it('prefers the resolved email over the provider claim', () => {
    expect(readProfile(user('verified@x.com', { email: 'raw@x.com' })).email).toBe('verified@x.com');
  });

  // Providers routinely send '' for fields they have no value for. An empty
  // string is not null, so a nullish check alone would let it render as a
  // blank name or a broken image.
  it('treats empty and whitespace-only values as absent', () => {
    expect(readProfile(user('', { full_name: '   ', avatar_url: '' }))).toEqual(EMPTY_PROFILE);
  });

  it('ignores non-string metadata', () => {
    expect(readProfile(user('a@b.com', { full_name: 42, avatar_url: { url: 'x' } }))).toMatchObject({
      fullName: null,
      avatarUrl: null,
    });
  });

  it("prefers the provider's given_name over splitting the display name", () => {
    // Splitting would greet this person as 'Maria' — half of a compound
    // given name — where the provider knows the whole of it.
    const p = readProfile(user('a@b.com', { full_name: 'Maria Luisa Fernández', given_name: 'Maria Luisa' }));
    expect(p.firstName).toBe('Maria Luisa');
    expect(p.fullName).toBe('Maria Luisa Fernández');
  });

  it('falls back to the first word when no given_name is sent', () => {
    expect(readProfile(user('a@b.com', { full_name: '  Ada   Byron Lovelace ' }).valueOf() as User).firstName).toBe(
      'Ada',
    );
  });

  it('never invents a name from the email address', () => {
    const p = readProfile(user('o.feruz@gmail.com', {}));
    expect(p.email).toBe('o.feruz@gmail.com');
    expect(p.fullName).toBeNull();
    expect(p.firstName).toBeNull();
  });

  it('handles a missing user and empty metadata', () => {
    expect(readProfile(null)).toEqual(EMPTY_PROFILE);
    expect(readProfile(user(null, {}))).toEqual(EMPTY_PROFILE);
  });
});

describe('localeToLanguage', () => {
  // Google sends region tags, so an exact 'he' match would send every
  // Israeli account carrying 'he-IL' to English.
  it.each(['he', 'he-IL', 'HE-il'])('maps %s to Hebrew', (locale) => {
    expect(localeToLanguage(locale)).toBe('he');
  });

  it.each(['en', 'en-US', 'fr', 'ru-RU', '', null])('maps %s to English', (locale) => {
    expect(localeToLanguage(locale)).toBe('en');
  });
});
