# Staged Creature Asset Manifest

HatchUp now supports staged creature art using:

`assets/creatures/staged/{element}_{stage}_{rarity}.png`

Stages:
- `baby`: levels 1-4
- `teen`: levels 5-14
- `final`: levels 15+

Elements:
- `leaf`
- `ember`
- `tide`
- `storm`

Rarities:
- `common`
- `uncommon`
- `rare`
- `epic`

Current staged creature files registered:
- `leaf_baby_common.png`, `leaf_baby_uncommon.png`, `leaf_baby_rare.png`, `leaf_baby_epic.png`
- `leaf_teen_common.png`, `leaf_teen_uncommon.png`, `leaf_teen_rare.png`, `leaf_teen_epic.png`
- `leaf_final_common.png`, `leaf_final_uncommon.png`, `leaf_final_rare.png`, `leaf_final_epic.png`
- `ember_baby_common.png`, `ember_baby_uncommon.png`, `ember_baby_rare.png`, `ember_baby_epic.png`
- `ember_teen_common.png`, `ember_teen_uncommon.png`, `ember_teen_rare.png`, `ember_teen_epic.png`
- `ember_final_common.png`, `ember_final_uncommon.png`, `ember_final_rare.png`, `ember_final_epic.png`
- `tide_baby_common.png`, `tide_baby_uncommon.png`, `tide_baby_rare.png`, `tide_baby_epic.png`
- `tide_teen_common.png`, `tide_teen_uncommon.png`, `tide_teen_rare.png`, `tide_teen_epic.png`
- `tide_final_common.png`, `tide_final_uncommon.png`, `tide_final_rare.png`, `tide_final_epic.png`
- `storm_baby_common.png`, `storm_baby_uncommon.png`, `storm_baby_rare.png`, `storm_baby_epic.png`
- `storm_teen_common.png`, `storm_teen_uncommon.png`, `storm_teen_rare.png`, `storm_teen_epic.png`
- `storm_final_common.png`, `storm_final_uncommon.png`, `storm_final_rare.png`, `storm_final_epic.png`

The uploaded source zip used `adult` for the final stage. Files were normalized
to `final` when copied into the app so runtime helpers stay baby/teen/final.

If any staged file is removed later, the app falls back to the current hatchling
art by element and rarity.
