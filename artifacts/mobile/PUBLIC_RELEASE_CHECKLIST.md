# HatchUp Public Release QA Checklist

## Account Login QA

- [ ] Create account with email/password.
- [ ] Login with email/password.
- [ ] Wrong password shows a friendly error.
- [ ] Forgot password sends a reset email without exposing whether the email exists.
- [ ] Email verification message appears after signup if Supabase confirmation is enabled.
- [ ] Google sign-in completes and lands in the existing HatchUp flow.
- [ ] Apple sign-in completes on supported iOS devices and degrades gracefully elsewhere.
- [ ] Sign out returns the user to the auth screen.
- [ ] App restart keeps the signed-in session.
- [ ] Local save migrates after sign-in without losing existing Pals, eggs, XP, quests, or profile data.
- [ ] Cloud save loads correctly on a second device signed into the same account.
- [ ] Offline mode works after prior sign-in and keeps local save data usable.
- [ ] Health permission flow still appears after sign-in when needed.
- [ ] Reset local data does not delete the Supabase Auth account.
- [ ] Privacy and Terms links open correctly from the auth screen.
- [ ] Row Level Security prevents access to another user's profile or save data.
- [ ] No plaintext passwords are stored in app tables.

## Command Reminders

```sh
pnpm --filter @workspace/mobile typecheck
pnpm --filter @workspace/mobile test
```
