import test from "node:test";
import assert from "node:assert/strict";

import {
    buildCombatOutcomeContext,
    buildCombatOutcomeHtml
} from "../src/module/combat-outcome.js";

test("combat outcome describes crit success damage multiplier", () => {
    const outcome = buildCombatOutcomeContext({
        resultType: "crit-success",
        item: { system: { critMult: 2 } }
    });

    assert.equal(outcome.tone, "success");
    assert.equal(outcome.description.startsWith("Урон x2."), true);
    assert.deepEqual(outcome.mechanicalEffects, [{ key: "damage-multiplier", value: 2 }]);
    assert.match(buildCombatOutcomeHtml(outcome), /z-combat-outcome--success/);
});

test("combat outcome hides normal success note to keep chat compact", () => {
    const outcome = buildCombatOutcomeContext({ resultType: "success" });

    assert.equal(buildCombatOutcomeHtml(outcome), "");
});

test("combat outcome marks crit fail as danger", () => {
    const outcome = buildCombatOutcomeContext({
        resultType: "crit-fail",
        item: { uuid: "Item.test", system: { weaponType: "ranged", noise: 8 } },
        attack: { noise: 4 },
        random: () => 0
    });

    const html = buildCombatOutcomeHtml(outcome);

    assert.equal(outcome.tone, "danger");
    assert.equal(outcome.critFailHint.key, "ranged");
    assert.equal(outcome.itemUuid, "Item.test");
    assert.equal(outcome.extraNoiseAmount, 12);
    assert.match(html, /z-combat-outcome--danger/);
    assert.match(html, /\u043a\u043b\u0438\u043d/);
    assert.deepEqual(outcome.critFailHint.triggeredEffects, [
        "jam",
        "misfire",
        "durability-loss",
        "extra-noise",
        "mag-drop",
        "weapon-drop",
        "breakage",
        "friendly-fire-risk"
    ]);
    assert.match(html, /сработало/);
    assert.match(html, /z-apply-weapon-jam/);
    assert.match(html, /z-apply-weapon-wear/);
    assert.match(html, /z-apply-extra-noise/);
    assert.match(html, /z-apply-weapon-drop/);
    assert.match(html, /data-amount="12"/);
});

test("combat outcome uses throwing crit fail hint for throwing attacks", () => {
    const outcome = buildCombatOutcomeContext({
        resultType: "crit-fail",
        item: {
            uuid: "Item.throwing",
            parent: { uuid: "Actor.attacker" },
            system: { weaponType: "ranged" }
        },
        attack: { mode: "throw" },
        random: () => 0
    });
    const html = buildCombatOutcomeHtml(outcome);

    assert.equal(outcome.critFailHint.key, "throwing");
    assert.equal(outcome.actorUuid, "Actor.attacker");
    assert.match(html, /\u043c\u0435\u0442\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0435/);
    assert.match(html, /z-apply-actor-status/);
    assert.match(html, /data-effect="prone"/);
    assert.match(html, /z-roll-bad-scatter/);
    assert.match(html, /z-apply-item-lost/);
});

test("combat outcome hides buttons for crit fail effects that did not trigger", () => {
    const outcome = buildCombatOutcomeContext({
        resultType: "crit-fail",
        item: { uuid: "Item.test", system: { weaponType: "ranged" } },
        random: () => 0.99
    });
    const html = buildCombatOutcomeHtml(outcome);

    assert.match(html, /нет:/);
    assert.doesNotMatch(html, /z-apply-weapon-jam/);
    assert.match(html, /z-apply-weapon-wear/);
    assert.doesNotMatch(html, /z-apply-extra-noise/);
});

test("melee crit fail can expose weapon drop button when triggered", () => {
    const outcome = buildCombatOutcomeContext({
        resultType: "crit-fail",
        item: { uuid: "Item.melee", system: { weaponType: "melee" } },
        random: () => 0
    });
    const html = buildCombatOutcomeHtml(outcome);

    assert.deepEqual(outcome.critFailHint.triggeredEffects, ["off-balance", "durability-loss", "weapon-drop"]);
    assert.match(html, /z-apply-weapon-drop/);
});
