# Re-enable Account Creation (Sign Up)

This project supports disabling/enabling user signups via a feature flag.

## Current behavior

When signups are disabled:

- The **“Sign up”** link is hidden on the auth screen.
- The app will **force `signIn` mode** if anything tries to switch to `signUp`.
- The email/password signup code path is **hard-blocked** (shows an error and returns to Sign In).

> Note: OAuth sign-in (e.g. Google) is still allowed. This document is specifically about **creating new accounts via email/password sign up in the app UI**.

## Where the flag lives

- **Env var:** `.env`
  - `EXPO_PUBLIC_ALLOW_SIGNUP=false`
- **Feature flag module:** `src/lib/featureFlags.ts`
  - `export const ALLOW_SIGNUP = process.env.EXPO_PUBLIC_ALLOW_SIGNUP === 'true';`
- **UI + guard:** `src/screens/AuthScreen.tsx`
  - The screen imports `ALLOW_SIGNUP` and uses it to hide the Sign Up link and guard the signup logic.

## Turn signups back ON (recommended steps)

1. Open `.env`
2. Change:

   `EXPO_PUBLIC_ALLOW_SIGNUP=false`

   to:

   `EXPO_PUBLIC_ALLOW_SIGNUP=true`

3. Restart the Expo dev server (env vars are loaded at start).

4. Rebuild the iOS app / redeploy to TestFlight as needed.

After that:

- The “Sign up” link will reappear.
- Users can create accounts from the app again.

## Turn signups OFF again

Set:

`EXPO_PUBLIC_ALLOW_SIGNUP=false`

…and restart/rebuild.

## Optional: server-side lock in Supabase (extra safety)

If you want to prevent *any* new users from being created (even if someone calls the API directly), also disable signups in Supabase:

1. Go to **Supabase Dashboard**
2. **Authentication** (Auth) settings
3. Disable **new user signups** / disable **email signups** (wording can vary)

This is independent of the app feature flag:

- **App flag** controls what your app UI allows.
- **Supabase setting** controls whether your backend will accept new signups at all.
