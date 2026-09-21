# IP Character Reference Pack V1

This pack defines the first original character roster for Waiting Entertainment / 餐桌推推王.

The goal is not to imitate any existing party-brawler character. The roster shares one world language but intentionally uses different body masses, silhouettes, tails, head shapes and locomotion personalities so players can identify fighters instantly on the big screen.

## Art direction

Common requirements for every character:

- original bipedal animal mascot
- oversized readable head
- compact torso
- chunky hands and feet
- simple rounded forms suitable for image-to-3D
- clean PBR color blocking
- no strand fur
- no transparent materials
- no loose cloth
- no thin accessories
- hands separated from torso
- feet fully visible
- special anatomy visible and not intersecting the body
- neutral studio background
- no weapons or handheld props in the base model
- suitable for aggressive squash/stretch and ragdoll animation

## V1 generated references

The image tasks below are the canonical V1 references in the connected Runway workspace. Keep the task IDs: later edits can reuse the exact image without relying on expiring copied URLs.

| ID | CN working name | Species / role | Body class | Primary silhouette | Palette | Runway task ID | Rodin / Hyper3D notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CH01 | 团团 | Wombat waiter / 袋熊服务生 | heavy | broad pear torso, tiny ears | cocoa / cream / brick red | `9382904c-e921-42b8-9acb-128833ad1598` | Keep arms clear of torso; preserve very broad chest/hips; avoid dense fur. |
| CH02 | 泡泡 | Axolotl helper / 六角恐龙帮厨 | light | head gills + slim body | coral / teal / pale aqua | `cd984823-0378-48cb-b4f4-7c8885388718` | Gills must be thick sculpted forms, not thin cards; simplify to animation-safe lobes. |
| CH03 | 甲甲 | Pangolin grill cook / 穿山甲烤台 | medium-heavy | armor plates + long armored tail | bronze / charcoal / orange | `cb855e5b-f3f6-458e-94d7-4fdb2d70a429` | Treat scales as large geometry groups or baked normal detail; tail needs 4-5 bones. |
| CH04 | 慢慢 | Capybara floor manager / 水豚领班 | medium-heavy | tall box torso + rectangular muzzle | tan / forest green / cream | `5724c76d-5a6e-4224-b1eb-f99fce4ddc95` | Keep muzzle simple; broad feet; should read calm and solid rather than round like CH01. |
| CH05 | 啵啵 | Duck dim-sum chef / 鸭子点心师 | light-medium | wide bill + oval body + webbed feet | white / navy / orange | `fb5e26ee-120d-42be-9c4d-ef399d44076f` | Wing-arms still need hand volumes for grabbing; keep webbed feet chunky for collision. |
| CH06 | 尾尾 | Red panda bartender / 小熊猫调酒师 | medium-light | huge striped tail + compact athletic body | rust / dark brown / bottle green | `d9f9ac1a-c022-4ff1-afd0-f5d21bb4b741` | Tail must stay detached from legs/torso in reference; 4-6 tail bones; no strand fur. |
| CH07 | 鼻仔 | Tapir dessert cook / 貘甜品师 | heavy | long rounded snout + broad hips | black / warm cream / plum | `04bf2180-9368-499d-b8dc-91197bbaa8a4` | Snout should be thick, not hose-like; keep hands/hips clear; distinct from capybara. |
| CH08 | 椒椒 | Gecko prep cook / 壁虎备菜 | light | long limbs + toe pads + tail | lime / yellow-green / cobalt | `d7e6c277-f944-4e36-87dc-e833ffe77d44` | Enlarge fingers/toes enough for clean topology; tail 4-5 bones; avoid tiny digits. |

## Gameplay personality targets

These are presentation identities, not hard stat classes. Physics should remain fair unless a later design explicitly introduces character abilities.

- CH01 Wombat: heavy, stubborn, slow-looking anticipation, big squash.
- CH02 Axolotl: springy, loose, exaggerated head-gill secondary motion.
- CH03 Pangolin: armored visual rhythm, strong rotational tumbles.
- CH04 Capybara: deadpan, upright, minimal facial panic until impact.
- CH05 Duck: quick, noisy-looking footwork, strong beak-led head reactions.
- CH06 Red panda: agile silhouette, tail creates strong spin/readability.
- CH07 Tapir: awkward heavy momentum, snout exaggerates recoil.
- CH08 Gecko: elastic lean, long-limb anticipation and toe-pad poses.

## Reference-image acceptance gate

Do not send a reference into Rodin/Hyper3D if any of these are true:

- hand or arm fused into torso
- feet cropped
- tail intersects both legs
- gills/ears/accessories are paper-thin
- costume contains hanging straps, ties or loose cloth
- multiple materials rely on transparency
- front silhouette cannot be understood at 96px height
- character only looks good because of dramatic camera perspective
- body proportions require fingers thinner than mobile-game topology can support

If a reference fails the gate, regenerate from the canonical task image as a reference rather than generating the character again from text from scratch.

## Next reference set per approved character

For characters that pass V1, create three derivatives from the exact same canonical image:

1. clean front 3/4 hero reference — already generated
2. strict front orthographic-style reference
3. strict side reference
4. back 3/4 reference only when tail/back anatomy is important

Use the same face, color blocks, costume shapes and body proportions. Do not independently redesign the character between views.
