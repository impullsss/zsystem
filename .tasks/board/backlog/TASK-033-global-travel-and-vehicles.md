# TASK-033 - Global Travel and Vehicles

## Goal

Turn the existing vehicle/global-map prototype into a reliable travel subsystem for wasteland exploration.

The campaign needs a layer between tactical scenes:

- moving across the global map;
- consuming fuel and travel time;
- using vehicles as valuable mobile assets;
- creating road events, encounters, breakdown pressure, ambushes, discoveries;
- making transport matter without turning travel into accounting hell.

## Implemented

### Stage 1 - Stabilize Existing Travel

- Extracted testable travel math into `src/module/travel-rules.js`.
- Added tests for travel distance, fuel cost, blocked no-fuel movement, walking movement, overload, terrain, events, vehicle wear, and chat output.
- Movement on global-map scenes can create travel chat cards.
- Vehicles spend fuel; walkers only report travel time.
- `npm run sim:travel` prints travel/event/wear/walker-fatigue projections.

### Stage 2 - Vehicle Sheet Foundation

- Vehicle sheet shows speed, handling, fuel, structure, cargo, passengers, range, and broken state.
- Vehicle cargo overload affects travel math.
- Passenger drag/drop bookkeeping exists.
- Repair/refuel controls are still later.

### Stage 3 - Global Map Rules

- Scene-level terrain presets:
  - road;
  - normal;
  - rough;
  - dangerous.
- Terrain modifies speed, vehicle fuel cost, event chance, vehicle wear pressure, and walker fatigue pressure.
- Overloaded vehicles spend more fuel, move slower, and have higher event chance.
- Scene-level movement modes:
  - cautious: slower, slightly cheaper/safer, less wear/fatigue;
  - normal: baseline;
  - forced: faster, more fuel, more events, more wear/fatigue.

### Stage 4 - Travel Events

- Optional travel event roll after movement:
  - no event;
  - encounter;
  - weather complication;
  - breakdown;
  - resource find;
  - hazard / roadblock.
- World setting `travelEventMode`: off / report.

### Stage 5 - Vehicle Risk and Maintenance

- Vehicle wear pressure now depends on:
  - distance;
  - terrain;
  - overload;
  - movement mode;
  - current vehicle condition for breakdown pressure.
- World setting `travelMaintenanceMode`:
  - off: no maintenance report;
  - report: show wear/breakdown risk in travel chat;
  - auto: automatically reduce vehicle structure when wear triggers.
- Auto maintenance can mark a vehicle as broken when breakdown triggers.
- Broken vehicles cannot travel until the broken checkbox is cleared or a later repair flow handles it.
- `npm run sim:travel` reports wear chance, average durability loss, and breakdown frequency.

### Stage 5.5 - Vehicle Repair Loop

- Vehicle sheet now reports repair parts available in the vehicle cargo.
- Vehicle sheet has a basic repair action:
  - spends repair parts from the vehicle cargo;
  - restores structure at 5 HP per part;
  - can clear `broken` if at least one part is spent and the vehicle has structure left.
- Repair part detection currently accepts:
  - `materials` items;
  - item category `parts` / `repair`;
  - names containing `запчаст`, `детал`, or `parts`.

### Stage 6 - Walker Travel Pressure

- Walkers now get a non-spending travel pressure report:
  - fatigue chance;
  - expected water;
  - expected food;
  - suggested rest time.
- The estimate depends on distance, time, terrain, movement mode, vigor, and survival skill.
- This is intentionally report-only until food/water/rest economy is designed.

## Foundry Checks Later

- Enable global map mode on a scene.
- Move a vehicle token with fuel: fuel decreases and travel chat appears.
- Move a vehicle token without enough fuel: movement is blocked and no wear/event should apply.
- Mark a vehicle as broken and try to move it: movement should be blocked.
- Set travel maintenance to auto and force/observe a breakdown: vehicle should become broken.
- Clear the vehicle broken checkbox and confirm movement works again.
- Put repair parts/materials in the vehicle cargo, damage/break the vehicle, press repair, and confirm parts are spent, HP rises, and broken clears.
- Move a survivor/NPC on the global map: no fuel is spent, time and walker pressure are reported.
- Change terrain: road should be faster/cheaper/safer, rough slower/more expensive, dangerous riskier.
- Change movement mode: cautious should be slower/safer, forced should be faster/riskier.
- Enable travel events in report mode: some travel cards should include a road event.
- Set travel maintenance to report: vehicle travel chat should show wear/breakdown odds without changing HP.
- Set travel maintenance to auto: vehicle travel can reduce structure HP when wear triggers.
- Run `npm run sim:travel` and compare walking / normal vehicle / cautious / forced scenarios.
- Check that travel chat is readable in the sidebar.

## Verified On 2026-05-05

- Vehicle movement works on a global-map scene.
- Basic vehicle repair works and restores structure using repair parts.
- Walker movement creates a travel chat card.

## Feedback / Issues From 2026-05-05 Foundry Test

- Vehicle repair should let the GM choose who repairs.
- Vehicle repair should roll Mechanics and use the result to determine repair quality, time, part cost, or failure.
- Travel pace is currently selected from scene configuration, not from an obvious in-play control.
- Walker food/water/fatigue is currently only reported in chat; automatic spending and fatigue application are still future work.

## Open Design Questions

- Should global-map movement be exact drag distance, hex/region based, or route-node based?
- Should vehicles carry party members mechanically, or only list passengers for bookkeeping?
- Should walkers consume food/water automatically, or should the system only report expected cost?
- Should travel events trigger by distance, time, terrain, or GM button?
- Should vehicle repair spend shelter parts, item parts, or a dedicated repair resource?
- Should broken vehicle recovery be a quick checkbox, a repair roll, a project, or all three depending on severity?

## Next Non-UX Mechanics

- Add optional auto-spend mode for walker food/water after the economy is agreed.
- Add route-node/event-table support later.
- Later: final UX placement, sheet polish, and region UI.
