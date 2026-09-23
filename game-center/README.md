# Game Center

This directory is the future plugin installation root.

## Planned structure

```
game-center/
├── installed/
│   ├── pilot-racer/
│   ├── sea-battle/
│   └── table-push-king/
│
├── import/
│   └── incoming game packages
│
└── registry/
    └── generated game index
```

## Rules

A game package must provide:

- game-package.json
- runtime information
- supported controllers
- display capability
- player limits
- version information

The Hub should discover packages automatically.

Do not manually edit game lists after Game Registry Manager is implemented.
