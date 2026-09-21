# Third-party assets

## Temporary low-poly character roster

Files are vendored in both the big-screen client and phone player public asset folders:

- `character-female-a.glb`
- `character-female-b.glb`
- `character-female-c.glb`
- `character-female-d.glb`
- `character-male-a.glb`
- `character-male-b.glb`
- `character-male-c.glb`
- `character-male-d.glb`

Origin: Kenney low-poly character assets, vendored from the CC0 asset collection present in `intellicia-public/parastore`.

License: **CC0 1.0 / public domain dedication**.

Purpose: temporary gameplay-quality character roster.

Each of the eight persistent player slots is assigned a different model variant. Physics, networking and gameplay remain independent from visual assets. Production models can later replace these GLB files or the roster mapping without changing authoritative gameplay code.

## Procedural environment

The restaurant scene, chairs, background tables, pendant lights, floor, walls and arena dressing are generated from Three.js primitives in this repository. They do not depend on external third-party visual assets.

## Reference repositories

Reference repositories are not bundled as dependencies merely because they were studied.

- Stick & Steel — MIT
- Buzz TV Party Game — MIT
- Couch Kit — MIT
- multiplayer-racer — GPLv3, research-only; source not copied
- Aetheria — no explicit LICENSE confirmed during review; research-only
- Pastel Nuketown — no explicit LICENSE confirmed during review; research-only
