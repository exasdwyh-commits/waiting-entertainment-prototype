# Three-Lane Project Control

This repository uses three independent work lanes so implementation, review, and project control do not block each other.

## Lane 1 — Implementation

Purpose: ship code only.

Responsibilities:
- implement the current approved gameplay slice;
- keep changes scoped to the active feature branch;
- add or update tests with the feature;
- do not self-approve merge readiness;
- stop feature expansion when the acceptance contract is satisfied.

Current implementation priority:
1. reconcile and finish Table Push King restaurant weapons V1;
2. pan / spatula / plate authoritative lifecycle;
3. phone controls + big-screen visuals;
4. only after the above is green: interactive restaurant props and destructibles.

Output contract:
- feature branch;
- PR with acceptance notes;
- build/test evidence.

## Lane 2 — Bug / Regression Audit

Purpose: challenge Lane 1, not extend it.

Responsibilities:
- inspect diffs independently;
- inspect CI, runtime and visual-preview failures;
- check authoritative-state invariants, reconnect/AI takeover, mobile control regressions, snapshot integrity and performance risks;
- create focused fixes only after a reproducible defect is identified;
- reject silent behavior changes and fake-green tests.

Current audit focus:
- PR #60 branch divergence and merge-base correctness;
- weapon ownership uniqueness;
- weapon pickup/drop while grabbed, KO'd, eliminated, disconnected or respawning;
- plate projectile expiry/collision safety;
- ten-client combat stress stability;
- phone landscape layout and big-screen visual regressions.

Output contract:
- defect list with severity and reproduction;
- pass/fail gate;
- separate bug-fix commits/PRs where needed.

## Lane 3 — Control / Integration

Purpose: own the global picture.

Responsibilities:
- maintain priorities, dependencies and acceptance gates;
- decide what enters or leaves scope;
- keep Lane 1 and Lane 2 independent;
- merge only after implementation + audit gates pass;
- update project status after each milestone;
- prevent architecture churn while a gameplay slice is being closed.

Current milestone:
**Table Push King Commercial Prototype V1**

Exit gates:
- Combat Parity A2 merged;
- Weapons V1 merged and green;
- no P0/P1 regression in 10-client stress;
- phone and big-screen visual preview pass;
- local real-device test checklist ready;
- remaining work clearly split into code work vs local art/device work.

## Merge rule

Implementation green alone is not sufficient.

A feature is merge-ready only when:
1. Lane 1 says acceptance scope is implemented;
2. Lane 2 says no blocking regression remains;
3. Lane 3 confirms dependencies, CI and project-state documentation are consistent.

## Working rule

Do not mix unrelated gameplay, Hub architecture, Sea Battle, Racer, and deployment changes in one feature PR.
