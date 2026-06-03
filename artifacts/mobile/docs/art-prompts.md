# HatchUp Games Beta Art Prompts

Use these prompts in ChatGPT image generation for the first real asset pack.
Generate square transparent PNGs with no text, no watermark, and no background.
Keep the same camera angle, lighting, and proportions across every asset.

## Global Style Prompt

Copy this paragraph into every prompt before the character-specific direction:

> Create a polished 2D mobile game creature asset for HatchUp Games, a cozy health-sync pocket monster app. Style: charming collectible creature, soft rounded shapes, clean silhouette, warm pastel palette, subtle cel shading, gentle rim light, crisp edges, high readability at small mobile size, centered full-body icon, transparent background, no text, no letters, no watermark, no UI, no scenery.

## Monster Evolution Line

Generate these four files first. They are the main mascot progression.

### `monster_egg.png`

> Create the HatchUp mascot in Egg stage. A warm cream and golden egg with tiny green sprout markings, soft shell shine, small crack-shaped decorative lines but not hatching yet, rounded friendly silhouette, centered full-body icon, transparent background. Use the global style prompt.

### `monster_baby.png`

> Create the HatchUp mascot in Baby stage. A small adorable leaf-inspired pocket monster newly hatched from an egg, round body, tiny feet, small leaf ears, bright curious eyes, soft green and cream palette, playful and gentle expression, centered full-body icon, transparent background. Use the global style prompt.

### `monster_teen.png`

> Create the HatchUp mascot in Teen stage. A more confident leaf-inspired pocket monster, medium body, stronger stance, larger leaf ears, small vine tail, energetic eyes, athletic but cute, green teal palette with warm cream accents, centered full-body icon, transparent background. Use the global style prompt.

### `monster_final.png`

> Create the HatchUp mascot in Final stage. A heroic fully evolved leaf-inspired pocket monster, elegant rounded body, confident stance, crown-like leaf crest, flowing vine tail, friendly guardian energy, premium collectible feel, green teal and gold accents, centered full-body icon, transparent background. Use the global style prompt.

## Element Egg Set

Generate four base eggs first. Rarity variants can be recolors later.

### `egg_leaf_common.png`

> Create a collectible Leaf egg for HatchUp Games. Cream egg shell with fresh green leaf spots, tiny sprout at the top, soft golden shadow, cozy friendly design, centered icon, transparent background. Use the global style prompt.

### `egg_ember_common.png`

> Create a collectible Ember egg for HatchUp Games. Warm cream egg shell with orange ember spots, tiny flame-shaped marking, soft glow accents, cozy friendly design, centered icon, transparent background. Use the global style prompt.

### `egg_tide_common.png`

> Create a collectible Tide egg for HatchUp Games. Pale blue cream egg shell with wave spots, tiny water-drop marking, soft aquatic shine, cozy friendly design, centered icon, transparent background. Use the global style prompt.

### `egg_storm_common.png`

> Create a collectible Storm egg for HatchUp Games. Lavender cream egg shell with cloud and lightning spots, tiny spark marking, soft electric glow, cozy friendly design, centered icon, transparent background. Use the global style prompt.

## Hatchling Set

Generate one hatchling per element for the Creature Dex.

### `hatchling_leaf_common.png`

> Create a small Leaf hatchling companion for HatchUp Games. Round tiny creature with leaf ears, sprout tail, bright eyes, soft green body, cheerful expression, collectible mobile game icon, centered full-body, transparent background. Use the global style prompt.

### `hatchling_ember_common.png`

> Create a small Ember hatchling companion for HatchUp Games. Round tiny creature with flame-shaped ears, ember tail, bright eyes, warm orange body, cheerful expression, collectible mobile game icon, centered full-body, transparent background. Use the global style prompt.

### `hatchling_tide_common.png`

> Create a small Tide hatchling companion for HatchUp Games. Round tiny creature with fin-like ears, water-drop tail, bright eyes, soft blue body, cheerful expression, collectible mobile game icon, centered full-body, transparent background. Use the global style prompt.

### `hatchling_storm_common.png`

> Create a small Storm hatchling companion for HatchUp Games. Round tiny creature with cloud-like ears, lightning-bolt tail, bright eyes, lavender body, cheerful expression, collectible mobile game icon, centered full-body, transparent background. Use the global style prompt.

## Rarity Variant Instructions

After the common set feels right, duplicate each egg and hatchling prompt with
these rarity modifiers:

- `uncommon`: add brighter accent markings, small sparkle highlights, slightly more saturated colors.
- `rare`: add a small aura glow, richer markings, more dynamic pose, premium collectible feel.
- `epic`: add gold accent details, stronger rim light, magical particle sparkle, still transparent background.

Use filename format:

- `egg_{element}_{rarity}.png`
- `hatchling_{element}_{rarity}.png`

Examples:

- `egg_leaf_epic.png`
- `hatchling_storm_rare.png`

## Export Checklist

- PNG format
- Transparent background
- Square image, ideally `1024x1024`
- No words or labels inside the image
- Subject centered with padding around edges
- Consistent size across all images
- Filename uses lowercase snake case

Run the asset audit before a TestFlight build:

```bash
pnpm --filter @workspace/mobile clean:assets
pnpm --filter @workspace/mobile audit:assets
```

The cleaner removes edge-connected white/checker backgrounds and rewrites the
PNG as RGBA. Any remaining `WARN` result means the PNG has no alpha channel and
should be regenerated or cleaned before public launch.

## Troubleshooting

If an API or tool returns `The model 'gpt-image-2' does not exist`, switch the
image model to a valid GPT image model such as `gpt-image-1.5`,
`gpt-image-1`, or `gpt-image-1-mini`. In the Responses API, use a mainline text
model such as `gpt-5` with the `image_generation` tool instead of putting a GPT
Image model in the top-level `model` field.
