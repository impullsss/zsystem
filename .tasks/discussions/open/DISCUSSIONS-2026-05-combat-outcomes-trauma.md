# DISCUSSIONS-2026-05 - Combat Outcomes, Crit Fails, and Trauma

## Context

The core d100 model is now unified:

```text
low d100 = good
1 - 5 = crit success
ordinary success follows crit success
ordinary fail sits before crit fail
high d100 = crit fail
```

Combat already uses `skill vs DC`, and crit success already reads the weapon crit multiplier from `system.critMult` with `1.5x` as the default fallback.

## Current Combat Outcome Standard

- Crit success: hit, damage uses weapon crit multiplier.
- Success: normal hit.
- Fail: normal miss, no extra penalty.
- Crit fail: currently only an explanatory chat note. AP and ammo are already spent, but no extra jam/drop/durability penalty is applied yet.

This is intentional. We should not add harsh failure effects until the frequency feels good in simulation and at the table.

## Design Direction

### Ordinary Fail

Keep it simple:

```text
ordinary fail = miss
```

No random punishment, no durability loss, no friendly fire by default.

### Crit Success

Current safe effect:

```text
damage x weapon crit multiplier
```

Future candidates:

- trauma roll bonus
- armor penetration boost
- increased triggered-effect chance
- called-shot reward if the target location matters

### Ranged Crit Fail

Candidate effects to test later:

- jam / weapon needs an action to clear
- durability loss
- extra noise
- dropped magazine / forced reload pressure
- minor AP loss next action
- rare weapon drop

Recommended first real mechanic, if we add one:

```text
ranged crit fail = small durability loss or jam chance, not both guaranteed
```

### Melee Crit Fail

Candidate effects to test later:

- lose balance / become vulnerable
- weapon durability loss
- weapon drop
- lose a small amount of AP
- rare self-opening for counterattack

Recommended first real mechanic, if we add one:

```text
melee crit fail = lose balance or small AP penalty, not direct self-damage
```

### Trauma

Trauma should be its own system, not just "crit = random bad thing".

Possible trigger rules:

- only on crit success
- only if damage after armor is high enough
- higher chance on called shots
- higher chance if damage type matches the body part
- reduced by armor, perks, or survivability

Possible trauma categories:

- bleeding
- fracture
- concussion
- organ wound
- limb disabled
- panic/shock

## Simulation Questions

Before enabling mechanical penalties, the simulator should answer:

- How many crit successes happen per average fight?
- How many crit fails happen per average fight?
- How often would a jam happen if crit fail has a 50% jam chance?
- How much durability would be lost per 100 attacks?
- Does a crit-fail penalty make low-skill characters annoying instead of tense?
- Does reduced crit-fail chance make high-skill characters feel reliably professional?

## Candidate Crit-Fail Profiles

Prototype module:

- `src/module/combat-fumble.js`

These profiles are not active penalties yet. They are used for simulation and design discussion.

Crit-fail attack chat cards now show a compact "possible future consequences" hint based on the weapon profile.

The first manual GM control is available:

- `Износ оружия -1` updates the attacking weapon `system.hp.value`.
- `Заклинить оружие` sets weapon `system.jammed = true`.
- `Лишний шум +N` adds extra noise through the existing `NoiseManager`.
- `Сбить атакующего с ног` applies the existing `prone` status to the attacker for profiles with off-balance.
- It is manual, not automatic.
- It is meant for table testing before enabling any mandatory crit-fail penalty.

### Ranged

- Jam: 50% per crit fail.
- Durability loss: `-1` per crit fail.
- Extra noise: 50% per crit fail.

### Melee

- Off balance: 50% per crit fail.
- Durability loss: 50% per crit fail.
- Weapon drop: 10% per crit fail.

### Throwing

- Bad scatter: 75% per crit fail.
- Item lost: 50% per crit fail.
- Off balance: 25% per crit fail.

Initial feeling:

- Ranged is the most punishing profile because jam + durability can stack quickly.
- Melee should probably avoid frequent weapon drops; 10% per crit fail is already noticeable over a campaign.
- Throwing needs special care later because "item lost" may be expected for grenades but annoying for reusable thrown weapons.
- Manual weapon wear is safer than automatic weapon wear because the GM can skip it for weird edge cases, unarmed attacks, or cinematic moments.
- Manual extra noise is a good first ranged consequence because it uses the existing noise/aggro system and is easy for the GM to understand.
- Manual jam is now a real weapon state, but still GM-triggered. It blocks attacks until the `Заклинило?` checkbox is cleared on the weapon sheet.
- Manual prone/off-balance is safer than a new custom status because `prone` already exists and already has movement/evasion handling.

## Current Recommendation

Keep these profile hints visible for table testing.

After simulation and Foundry feedback, we can decide whether manual weapon wear/noise/off-balance should stay manual, become settings, or become automatic for specific weapon profiles.

## Protection / Armor Follow-up

Implemented as a shared model:

- `src/module/protection.js` is now the common place for natural AC, equipped armor AC, covered body parts, DR, armor piercing, and final damage after protection.
- Normal actor damage uses the shared protection model.
- Ballistic preview reads target armor through the shared protection model.
- Manual ballistic side-hit buttons avoid subtracting armor AC twice: projectile impact spends AC first, then actor DR may still reduce the final applied wound.
- `npm run sim:protection` prints a quick table for ammo type vs armor/DR, so we can tune armor, AP, and ballistic power without only relying on hand tests in Foundry.

Questions to test later:

- Should ballistic DR apply after projectile impact, or should some ammo types partially ignore DR too?
- Should armor durability decrease when it absorbs high-energy ballistic hits?
- Should crit success grant extra AP/penetration, extra trauma severity, or only the current damage multiplier?

## Auto Ballistics Mode

Implemented as an optional fourth firearm chat mode:

```text
off -> no ballistic chat
report -> report only
manual -> report + GM buttons
auto -> report + automatic side-hit damage
```

Design rule:

- Ordinary miss does not always become friendly fire.
- In auto mode, a line-of-fire side hit is allowed only when the interference penalty could have changed the roll from success into failure.
- If the shooter simply rolled badly, auto mode does not punish the nearest bystander.
- Auto mode applies only side-hit / overpenetration / burst-cone entries. The main target damage flow remains the existing attack damage flow.
- Side-hit damage is applied after projectile impact math, so armor AC is not subtracted twice; DR may still reduce the wound.

Manual mode is still safer for edge cases and table drama. Auto mode is for faster tactical firefights once the table trusts the rules.

Foundry checks to run later:

- Set `Огнестрел: баллистика в чате` to `auto`.
- Miss because a token is directly on the line of fire: nearest blocker should take automatic side-hit damage.
- Miss for another reason with a blocker visible but not mathematically decisive: no automatic side-hit damage.
- Hit target with someone behind it and enough projectile power: overpenetration should apply automatically.
- Burst at a group: cone side hits should apply automatically.
- Switch back to `manual`: GM buttons should appear and auto damage should stop.

## Armor Wear and Ammo Trauma

Implemented next layer:

- Ammo profiles now carry a trauma multiplier.
- Current defaults:
  - standard: `x1`
  - armor-piercing: `x0.9`
  - expansive: `x1.25`
  - shot: `x1.15`
  - subsonic: `x0.95`
  - homemade: `x1.05`
- Ammo items can add a custom `system.traumaMultiplier` modifier from the item sheet.
- Main attack trauma and ballistic side-hit trauma use ammo trauma multipliers.
- Armor protection now estimates durability wear from mitigated damage.
- New world setting: `Броня: износ от поглощения`.
  - `off`: hide armor wear.
  - `report`: show recommended wear in Absorb Log.
  - `auto`: automatically reduce equipped covered armor durability.
- `npm run sim:protection` now prints trauma multiplier and estimated armor wear.

Design note:

Armor wear is intentionally tied to mitigation, not just being hit. If armor did real work, it takes stress. If damage bypassed it or the hit was unarmored, wear stays low/absent.

Foundry checks to run later:

- Put armor with HP on torso, set armor wear to `report`, receive ballistic damage: Absorb Log should show recommended wear.
- Set armor wear to `auto`, repeat: armor item HP should decrease.
- Use expansive ammo and compare trauma pressure to standard ammo.
- Use armor-piercing ammo and compare lower trauma multiplier but better penetration.

## Combat Chat Protection Preview

Implemented a compact combat-card section for normal attacks:

- Shows raw rolled damage.
- Shows target AC / DR used for the selected hit location.
- Shows ammo/weapon armor piercing when present.
- Shows headshot `x2 after armor` reminder.
- Shows estimated armor wear when the hit stresses armor.
- Shows final damage after protection.

Goal:

- The GM should no longer need to mentally reverse-engineer why a hit dealt less damage than the card's raw damage.
- This is especially important now that armor, AP ammo, trauma multipliers, and automatic ballistic side hits are all interacting.

Foundry checks to run later:

- Shoot an unarmored target: protection section should be simple and final damage should match raw damage.
- Shoot an armored torso: AC / DR and final damage should be visible.
- Shoot with AP ammo: armor piercing row should appear.
- Shoot the head: head multiplier note should appear.
- Use armor wear mode `report` or `auto`: armor wear estimate should line up with Absorb Log / actual item HP change.

## Current Larger Combat Roadmap

## Burst Fire / Fire Line Update

Implemented after table discussion:

- Burst fire should not be all-or-nothing.
- Each fired bullet now resolves its own target selection.
- A bullet can hit the primary target, miss, hit a line-of-fire stray target, or hit a cone collateral target.
- Misses do not automatically hit the nearest blocker; line/cone collateral uses probabilities.
- Primary burst bullets stay in the normal attack damage pipeline, so the main target is not damaged twice by auto ballistics.
- Side-hit / overpenetration / cone entries remain the ballistic layer responsibility.
- Comma decimals are accepted for ballistic tuning fields, so `0,5` is valid for line width style values.

Design intent:

- Aimed/single shots stay clean and predictable.
- Bursts feel dangerous around groups without becoming guaranteed friendly-fire machines.
- Shot ammo can widen line/cone risks through ammo modifiers, while slug-like ammo can stay closer to a normal projectile profile.

Near-term:

- Table-test auto ballistics mode in Foundry.
- Tune armor wear numbers after seeing real fight pacing.
- Tune ammo trauma multipliers after comparing standard / AP / expansive / shot ammo.
- Improve combat card readability if any line is still too dense in the chat sidebar.

Mid-term:

- Add armor condition thresholds, for example intact / damaged / broken.
- Make damaged armor affect AC, DR, or coverage instead of only reducing HP.
- Add clearer line-of-fire visualization before firing: who is in danger, who may be pierced, who is inside burst cone.
- Add a GM-facing debug helper for forced ballistic rolls and forced fumble outcomes, not only forced d100.

Later:

- More detailed trauma tables by damage type and body part.
- More interesting crit-fail profiles by weapon family.
- Optional auto-confirm setting for all ballistic collateral damage once table trust is high.
- Better dedicated UI placement for social profile and combat diagnostics.
