# Supabase Google OAuth Setup

Use this checklist for Expo Go, Android APK, and web Google sign in/sign up.

## Supabase Provider

1. Open Supabase Dashboard.
2. Go to Authentication -> Providers -> Google.
3. Enable Google.
4. Add the Google Client ID.
5. Add the Google Client Secret.
6. Save the provider settings.

## Supabase URL Configuration

1. Go to Authentication -> URL Configuration.
2. Set Site URL to:

```text
https://eya.vercel.app
```

3. Add these Redirect URLs:

```text
eya://auth/callback
https://eya.vercel.app/auth/callback
```

4. For Expo Go, start the app and tap a Google auth button. Copy the exact console value printed after:

```text
[google-auth] redirectUri
```

5. Add that exact Expo Go redirect URI to Supabase Redirect URLs.

## Google Cloud Console

1. Open Google Cloud Console.
2. Go to APIs & Services -> Credentials.
3. Open the OAuth client used by Supabase.
4. Add this Authorized redirect URI:

```text
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

Replace `<PROJECT_REF>` with your Supabase project ref.

## Local Test Flow

1. Start Expo with a clean cache:

```bash
npx expo start -c
```

2. Tap Google sign in or Google sign up.
3. Continue in the browser.
4. Choose a Google account.
5. Confirm the app returns to `/redirect`.

## Expected Redirects

- Expo Go uses the redirect URI printed in the console.
- Android APK uses `eya://auth/callback`.
- Web uses `https://eya.vercel.app/auth/callback`.
- Keep `EXPO_PUBLIC_AUTH_REDIRECT_URL` empty unless testing a specific redirect URI.
