# Development Workflow

## Development Principle

Build like an arcade product, not a SaaS product.

Priority order:

1. Gameplay feel
2. Large screen experience
3. Easy joining
4. Multiplayer stability
5. Expandability

## Phase Process

Every phase must record:

1. Completed features
2. Run instructions
3. Test results
4. Screenshot suggestions
5. Next risks

## Branch Strategy

main:
Stable milestones

feature branches:
Experimental development

## Coding Rules

- TypeScript first
- Shared types between client/server
- Avoid tightly coupled game logic
- Keep gameplay modules reusable

## Future Engine Direction

Waiting Entertainment Engine:

```
Core Engine
  |
  +-- Table Push King
  +-- Sea Battle
  +-- Racing
  +-- Party Games
```
