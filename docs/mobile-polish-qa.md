# HatchUp Mobile Polish QA

Use this checklist before each TestFlight build. Start with a clean install, then use the hidden Profile > Settings > Test tools drawer in non-public builds to switch QA fixtures.

## Device Coverage

- [ ] iPhone small screen: verify Home, Hatchery, Collection, Ranks, and Profile fit without bottom-nav overlap.
- [ ] iPhone large screen: verify cards do not feel overly stretched and hero art remains centered.
- [ ] Android small screen: verify tab navigation, safe areas, and long lists scroll cleanly.

## Health And Sync

- [ ] Permission denied: apply the Health permission denied fixture and confirm the app gives one clear recovery action.
- [ ] No health data: confirm Home explains that Sync movement starts the loop and no empty reward cards appear.
- [ ] First sync: apply Synced today, no Pal and verify the compact synced summary plus next action.
- [ ] Second sync same day: sync again and confirm XP/egg progress does not duplicate incorrectly.
- [ ] Next day streak: advance device date or fixture data and confirm streak increments once.

## Core Loop

- [ ] Hatch first Egg: apply Egg ready, open Hatchery, hatch, and confirm reveal modal works.
- [ ] Choose profile Pal: apply First Pal hatched, open Profile, choose Pal picture, save profile.
- [ ] Active Pal selected: apply Active Pal selected and verify Home, Collection, and Profile agree on active Pal.
- [ ] Collection with several Pals: verify owned Pals appear first, locked previews are not overwhelming, and filters stay tucked away.

## Ranks And Privacy

- [ ] Private leaderboard: apply Private leaderboard and confirm user is not ranked.
- [ ] Shared leaderboard: apply Shared leaderboard and confirm public name and weekly score appear.
- [ ] Enable/disable ranks: toggle sharing and confirm copy says only display name and weekly score are shared.

## Test Modes

- [ ] Mock mode: apply Mock mode and confirm the health source reads as mock/local test data.
- [ ] Reset app data: confirm reset clears local progress but does not claim to delete an auth account.
- [ ] Test Lab hidden: confirm Test tools is unavailable in production/public builds.
