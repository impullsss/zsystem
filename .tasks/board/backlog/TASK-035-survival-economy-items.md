# TASK-035 - Survival Economy Items

## Goal

Turn food, water, repair parts, tools, medicine, scavenging, and field maintenance into a balanced resource loop instead of loose item names.

## Baseline Model

- Food unit:
  - one compact meal;
  - 0.5 kg;
  - 8 caps;
  - two units cover one survivor for a quiet day.
- Water unit:
  - one liter;
  - 1 kg;
  - 4 caps;
  - three units cover one survivor for a quiet day.
- Repair part:
  - one generic mechanical part;
  - 0.35 kg;
  - 10 caps;
  - roughly 5 vehicle HP or one meaningful weapon repair step.
- Scrap:
  - half a repair part;
  - 0.45 kg;
  - 4 caps;
  - inefficient but common salvage.
- Medicine pack:
  - one treatment consumable;
  - 0.2 kg;
  - 18 caps;
  - used for trauma, bleeding, infection pressure, or treatment support.
- Field tools:
  - 3 kg;
  - 60 caps;
  - baseline kit for normal repair checks.
- Workshop tools:
  - 20 kg;
  - 300 caps;
  - settlement/vehicle-grade kit, not casual backpack gear.

## Balance Targets

- A quiet one-person day should cost about 28 caps and weigh about 4 kg before reserve.
- Water should be the main carry-weight pressure.
- Repair parts should be expensive enough that vehicle damage is a campaign choice, not free bookkeeping.
- Tools should be a one-time investment that changes repair odds, not a consumable.
- Medicine should be light but expensive, so trauma has logistical pressure.

## Implemented

- Added `src/module/survival-economy.js` with:
  - item blueprints;
  - daily need calculation;
  - repair reserve calculation;
  - loadout weight/value calculation;
  - deterministic scavenging yield estimates;
  - economy scenario reporting.
- Added `npm run sim:economy`.
- Added automated tests for resource math, scaling, repair reserves, and scavenging.

## Foundry Item Packs To Create Later

- Food:
  - dry ration;
  - canned food;
  - fresh meat;
  - spoiled food.
- Water:
  - clean water;
  - dirty water;
  - water canister.
- Repair:
  - scrap;
  - repair parts;
  - weapon parts;
  - vehicle parts if generic parts become too broad.
- Tools:
  - improvised tools;
  - field toolkit;
  - mechanic toolkit;
  - workshop kit.
- Medicine:
  - bandage;
  - splint;
  - antiseptic;
  - medkit;
  - surgical kit.

## Open Design Questions

- Should dirty water cause an infection/poison roll immediately, or only when used repeatedly?
- Should food spoilage matter on normal scenes, only on travel, or only when the GM enables a harsh survival mode?
- Should repair parts stay generic, or split into weapon parts / vehicle parts / electronics later?
- Should scavenging create actual items immediately, or generate a loot roll that the GM confirms?
- Should camps reduce food/water needs, increase scavenge yield, or mainly provide safe healing and repair time?
