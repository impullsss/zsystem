import test from "node:test";
import assert from "node:assert/strict";

import {
    applyFirearmBallisticsAuto,
    buildFirearmBallisticsChatContext,
    buildFirearmBallisticsChatHtml
} from "../src/module/firearm-chat.js";

globalThis.canvas = {
    grid: { size: 100 },
    tokens: { placeables: [] }
};

function makeToken({ id, name = id, x, y, armor = 0 } = {}) {
    return {
        id,
        name,
        visible: true,
        center: { x, y },
        w: 100,
        h: 100,
        document: { uuid: `Scene.scene.Token.${id}` },
        actor: {
            system: { secondary: { naturalAC: { value: 0 } } },
            items: {
                filter(callback) {
                    return armor > 0
                        ? [{ type: "armor", system: { equipped: true, coverage: { torso: true }, ac: armor } }].filter(callback)
                        : [];
                }
            }
        }
    };
}

test("firearm chat context offers manual stray hit entries on ordinary fail", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", x: 1000, y: 0 });
    const friend = makeToken({ id: "friend", name: "Friend", x: 500, y: 20 });
    canvas.tokens.placeables = [source, target, friend];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 30, lineWidth: 0.75 } },
        attack: { dmg: "20", bullets: 1 },
        resultType: "fail",
        random: () => 0
    });

    assert.equal(context.entries[0].kind, "stray");
    assert.equal(context.entries[0].targetName, "Friend");
    assert.equal(context.entries[0].resultType, "success");
    assert.match(buildFirearmBallisticsChatHtml(context), /z-apply-ballistic-damage/);
    assert.match(buildFirearmBallisticsChatHtml(context), /data-result-type="success"/);
    assert.match(buildFirearmBallisticsChatHtml(context), /data-armor-piercing="0"/);
    assert.match(buildFirearmBallisticsChatHtml(context), /data-trauma-multiplier="1"/);
});

test("firearm chat context reports burst interruption on crit fail", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", x: 1000, y: 0 });
    const other = makeToken({ id: "other", name: "Other", x: 800, y: 80 });
    canvas.tokens.placeables = [source, target, other];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 25, burstConeAngle: 24 } },
        attack: { dmg: "12", bullets: 5 },
        resultType: "crit-fail",
        random: () => 0.1
    });

    assert.equal(context.burst.interrupted, true);
    assert.match(buildFirearmBallisticsChatHtml(context), /клин оборвал очередь/);
});

test("firearm chat report mode hides manual damage buttons", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", x: 1000, y: 0 });
    const friend = makeToken({ id: "friend", name: "Friend", x: 500, y: 20 });
    canvas.tokens.placeables = [source, target, friend];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 30, lineWidth: 0.75 } },
        attack: { dmg: "20", bullets: 1 },
        resultType: "fail",
        mode: "report",
        random: () => 0
    });

    assert.doesNotMatch(buildFirearmBallisticsChatHtml(context), /z-apply-ballistic-damage/);
});

test("firearm chat off mode suppresses ballistic output", () => {
    const context = buildFirearmBallisticsChatContext({
        item: { system: { weaponType: "ranged" } },
        attack: { dmg: "20", bullets: 1 },
        mode: "off"
    });

    assert.equal(context.enabled, false);
    assert.equal(buildFirearmBallisticsChatHtml(context), "");
});

test("firearm auto mode limits ordinary miss to nearest line target and hides buttons", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", x: 1000, y: 0 });
    const first = makeToken({ id: "first", name: "First", x: 350, y: 20 });
    const second = makeToken({ id: "second", name: "Second", x: 650, y: 20 });
    canvas.tokens.placeables = [source, target, first, second];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 30, lineWidth: 0.75 } },
        attack: { dmg: "20", bullets: 1 },
        ammo: { system: { ammoKind: "expansive" } },
        resultType: "fail",
        allowFailStray: true,
        mode: "auto",
        random: () => 0
    });

    assert.equal(context.entries.length, 1);
    assert.equal(context.entries[0].targetName, "First");
    assert.equal(context.entries[0].traumaMultiplier, 1.25);
    assert.doesNotMatch(buildFirearmBallisticsChatHtml(context), /z-apply-ballistic-damage/);
    assert.match(buildFirearmBallisticsChatHtml(context), /Авто-режим/);
});

test("firearm auto mode does not turn every miss into a stray hit", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", x: 1000, y: 0 });
    const friend = makeToken({ id: "friend", name: "Friend", x: 500, y: 20 });
    canvas.tokens.placeables = [source, target, friend];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 30, lineWidth: 0.75 } },
        attack: { dmg: "20", bullets: 1 },
        resultType: "fail",
        mode: "auto",
        allowFailStray: false,
        random: () => 0
    });

    assert.equal(context.entries.length, 0);
});

test("firearm chat context reports primary burst hits per bullet", () => {
    const source = makeToken({ id: "source", x: 0, y: 0 });
    const target = makeToken({ id: "target", name: "Target", x: 1000, y: 0 });
    canvas.tokens.placeables = [source, target];

    const context = buildFirearmBallisticsChatContext({
        sourceToken: source,
        targetToken: target,
        item: { system: { weaponType: "ranged", ballisticPower: 25, burstConeAngle: 24 } },
        attack: { dmg: "12", bullets: 3 },
        resultType: "success",
        random: () => 0
    });

    assert.equal(context.entries.filter((entry) => entry.kind === "primary").length, 3);
    assert.deepEqual(context.entries.map((entry) => entry.shot), [1, 2, 3]);
    assert.match(buildFirearmBallisticsChatHtml(context), /пуля 1/);
});

test("firearm auto mode can apply side-hit damage through injected handler", async () => {
    const calls = [];
    const actor = { name: "Friend" };
    globalThis.fromUuid = async () => ({ actor });

    const result = await applyFirearmBallisticsAuto({
        enabled: true,
        mode: "auto",
        entries: [{
            kind: "stray",
            tokenUuid: "Scene.scene.Token.friend",
            targetName: "Friend",
            damage: 7,
            damageType: "ballistic",
            location: "torso",
            armorPiercing: 3,
            resultType: "success"
        }]
    }, {
        applyDamage: (payload) => calls.push(payload)
    });

    assert.equal(result.applied.length, 1);
    assert.equal(calls[0].actor, actor);
    assert.equal(calls[0].damage, 7);
    assert.equal(calls[0].armorPiercing, 3);

    delete globalThis.fromUuid;
});
