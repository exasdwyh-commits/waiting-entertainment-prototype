# Rodin / Hyper3D Character Production Pipeline

This document defines how the Waiting Entertainment character references should become runtime-ready Three.js characters.

## 1. Input image

Use the canonical reference from `docs/IP_CHARACTER_REFERENCE_PACK.md`.

Preferred source image:

- single character
- clean background
- full body
- hands separated
- feet visible
- minimal perspective distortion
- no prop
- no text
- no transparency-dependent detail

For tail-heavy or asymmetric characters, also prepare a side or back 3/4 reference before final modeling.

## 2. Image-to-3D

Create the highest-quality clean base mesh first. Do not ask the generator to solve animation, weapons, physics and facial systems at the same time.

The generated model should prioritize:

- recognizable silhouette
- correct limb separation
- watertight torso and limbs
- clean mouth/snout volume
- robust hands/feet
- tail/gill geometry thick enough to rig
- simple material segmentation

## 3. Runtime geometry budget

Target budget for the first production pass:

- hero/master mesh: ideally 12k-22k triangles, hard ceiling about 30k
- mobile LOD: 5k-9k triangles
- one 1024-2048 texture atlas
- preferably 1 material; maximum 2 for the base character
- avoid alpha cards, strand fur and layered transparent cloth

The current game can show ten fighters simultaneously, including on phones, so silhouette and animation matter more than tiny surface detail.

## 4. Rig

Use a shared humanoid core whenever possible:

- hips
- spine x2-3
- chest
- neck
- head
- clavicles
- upper/lower arms
- hands
- upper/lower legs
- feet

Character-specific extras:

- tail: 3-6 bones
- axolotl gills: use a few grouped secondary bones rather than one bone per tiny branch
- duck wing/hand: preserve humanoid grab points even if the visual reads as a wing
- tapir snout: optional 1 secondary bone only if deformation is useful

Keep the gameplay root/pelvis structure consistent so the existing animation-state adapter can reuse the same core animations.

## 5. Required animation compatibility

Every character must support the existing and upcoming combat states:

- idle
- walk
- sprint
- punch
- heavy strike
- grab
- carry victim
- being carried
- throw
- hit
- ragdoll transition
- recover / get up
- edge hang
- climb
- celebrate
- eliminated

Upcoming Phase A also needs:

- jump
- kick
- headbutt
- dropkick
- struggle / break grab
- KO / wake-up

Do not bake gameplay displacement into clips unless explicitly needed. Root motion should remain controlled by the authoritative Rapier simulation.

## 6. Physics compatibility

The rendered mesh is not the authoritative body.

Continue using a simple gameplay collider / rigidbody and let the character mesh exaggerate:

- squash/stretch
- chest recoil
- head lag
- tail drag
- limb flop
- recovery poses

This preserves multiplayer determinism while giving a more active-ragdoll feel.

## 7. Export

Preferred runtime delivery:

- GLB
- embedded or adjacent texture atlas
- consistent forward axis and meter scale
- origin at gameplay root
- animation clips named consistently

Before replacing a production character, validate:

- loads in Three.js
- no missing texture
- no negative scale
- no extreme bone count
- animations retarget correctly
- phone FPS remains acceptable
- silhouette still reads on big-screen spectator camera

## 8. Integration strategy

Do not replace all ten fighters at once.

Recommended sequence:

1. CH01 Wombat — validates heavy/chunky proportions
2. CH06 Red panda — validates tail rig
3. CH02 Axolotl — validates special head anatomy
4. CH08 Gecko — validates long-limb rig
5. remaining roster

Once these four archetypes work with the shared skeleton and animation adapter, the rest are lower-risk.

## 9. Current runtime handoff

`shared/src/characters.ts` is the seat-to-IP roster. CH01–CH08 use the canonical concepts in `IP_CHARACTER_REFERENCE_PACK.md`. CH09–CH10 are visual candidates only; their names and species require approved reference sheets before final modeling.

The client and personal phone view currently use lightweight, original soft-plush preview meshes for all ten slots. These previews make each seat recognizable while the production Hyper3D/Rodin assets are prepared. They are not final 3D deliverables.

To integrate an approved character:

1. Export a rigged GLB with animation clips and textures that pass the budgets and checks above.
2. Put the same GLB at `client/public/characters/CHxx.glb` and `player/public/characters/CHxx.glb`. Both apps resolve the runtime path `/characters/CHxx.glb` from their own origin.
3. Set that character's `modelUrl` in `shared/src/characters.ts` to `/characters/CHxx.glb` and rebuild shared, client and player.
4. Inspect idle, movement, hit and elimination on both the spectator screen and a phone-sized viewport. If the GLB fails to load, the slot falls back to its plush preview.

Character selection and gameplay stats are separate product decisions. The current match maps one identity to each seat and keeps the existing physics unchanged.
