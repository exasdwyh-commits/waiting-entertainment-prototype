# Table Push King - Game Design

## Overview

Table Push King is the first validation game for Waiting Entertainment.

The goal is not a traditional mobile game. It is a public multiplayer entertainment experience for restaurant waiting areas.

## Core Loop

- 2-8 players
- 60 second rounds
- Last surviving player wins
- Browser big screen display
- Mobile controller input

## Player Actions

MVP controls:

Left joystick:
- Move character

Right button:
- Push attack

## Arena

Circular dining table arena.

Players try to push opponents outside the safe area.

## Character States

```
IDLE
MOVING
PUSHING
HIT
RAGDOLL
RECOVERING
EDGE_HANG
ELIMINATED
```

## Physics Goals

The game feeling depends on:

- Strong collision feedback
- Funny knockdowns
- Recovery moments
- Dramatic edge saves

## AI Goal

Simple bots:

- Find nearest player
- Move toward target
- Push when close
- Avoid dangerous edges

## MVP Non Goals

Do not build:

- Items
- Skills
- Economy
- Accounts
- Cosmetics

Focus on fun first.
