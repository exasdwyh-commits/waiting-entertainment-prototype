# Sea Battle 3D Asset Pipeline

Sea Battle keeps gameplay physics and scoring server-authoritative. GLB/GLTF assets replace visuals only.

## Slots

Edit `public/assets/sea-battle-assets.json`.

- `ship`: one static ship model cloned for all eight boats.
- `monster`: one static sea-monster model.
- `islands`: zero or more island/rock scene props with independent transforms.

When a URL is empty, missing, or fails to load, the existing procedural visual remains active.

## Export contract

Use GLB when possible. Keep +Y up and ship bow facing +Z. Apply transforms in Blender before export where practical; use manifest `scale`, `rotationY`, and offsets only for final alignment.

Recommended unscaled ship bounds are roughly 2.5 units wide by 5 units long. Collision, broadside range, safe-zone pressure, and monster attacks do not derive from model geometry.

Use ordinary static meshes and embedded textures for the first production pass. Avoid Draco/KTX2 dependencies until the runtime explicitly enables those decoders.

## Example

```json
{
  "schemaVersion": 1,
  "ship": {
    "url": "/assets/ships/corsair.glb",
    "scale": 0.85,
    "rotationY": 0,
    "offsetY": -0.2
  },
  "monster": {
    "url": "/assets/monsters/kraken.glb",
    "scale": 1.4,
    "rotationY": 0,
    "offsetY": 0
  },
  "islands": [
    {
      "url": "/assets/islands/volcanic-rock.glb",
      "x": 62,
      "z": 0,
      "y": 0,
      "scale": 1.2,
      "rotationY": 0.4
    }
  ]
}
```

Put referenced files anywhere under `public/assets/`. No gameplay source changes are needed.
