# HatchUp Public Beta Journey QA

Run this checklist before every TestFlight build that changes onboarding, save state, rewards, profile, or ranks.

## First Install Journey

- Start signed out and verify the auth screen loads without old state.
- Enter guest/test flow only when the build intentionally enables it.
- Complete first-run onboarding: username, starter Egg, sync explanation, demo sync, hatch, active Pal, training, reward summary.
- Force close and reopen; onboarding must not repeat after completion.

## Core Loop

- Sync movement with no Pal and confirm Egg progress is clear.
- Hatch a ready Egg and confirm the new Pal appears in Collection.
- Set a Pal active from Collection detail and confirm Home/sticky status agree.
- Train active Pal and confirm feedback shows XP, bond, power, and sessions left.
- Claim weekly chest when ready and verify reward history updates.

## Account And Cloud

- Email login works and restarts keep the session.
- Local save merges after sign-in without losing Pals, Eggs, inventory, badges, or profile.
- Turn cloud save off and on; failed sync shows a retry path.
- Offline after prior sign-in keeps local progress usable.

## Sharing And Privacy

- Ranks stays private until opted in.
- Public Ranks copy says only display name, rank, and weekly score are public.
- Trainer Card share never includes private health details when Ranks is off.
- Profile link share succeeds or falls back to the native share sheet.

## Layout

- Check iPhone small screen, iPhone large screen, and Android small screen.
- Confirm bottom nav and sticky status never cover CTAs.
- Confirm Collection, Profile, and Ranks have clear empty states.
