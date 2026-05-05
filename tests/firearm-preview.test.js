import test from "node:test";
import assert from "node:assert/strict";

import {
    buildAimingBallisticsPreview,
    buildAimingBallisticsPreviewHtml,
    getTokenBallisticArmor
} from "../src/module/firearm-preview.js";

globalThis.canvas = {
    grid: { size: 100 },
    tokens: { placeables: [] }
};

function makeToken({ id, name = id, x, y, armor = 0, visible = true } = {}) {
    return {
        id,
        name,
        visible,
        center: { x, y },
        w: 100,
        h: 100,
        actor: {
            system: {
                secondary: {
                    naturalAC: { value: 0 }
                }
            },
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

test("token armor preview reads equipped armor for the selected location", () => {
    const token = makeToken({ id: "armored", x: 0, y: 0, armor: 5 });

    assert.equal(getTokenBallisticArmor(token), 5);
});

test("aiming ballistics preview lists line and burst cone risks", () => {
    const sourceToken = makeToken({ id: "source", x: 0, y: 0 });
    const targetToken = makeToken({ id: "target", name: "Target", x: 1000, y: 0 });
    const lineToken = makeToken({ id: "line", name: "Line Friend", x: 500, y: 30 });
    const coneToken = makeToken({ id: "cone", name: "Cone Friend", x: 800, y: 120 });

    const preview = buildAimingBallisticsPreview({
        sourceToken,
        targetToken,
        item: { system: { weaponType: "ranged", lineWidth: 0.75, burstConeAngle: 24 } },
        attack: { dmg: "12", bullets: 3 },
        tokens: [sourceToken, targetToken, lineToken, coneToken]
    });

    assert.equal(preview.enabled, true);
    assert.ok(preview.lineRisks.some((risk) => risk.id === "line"));
    assert.ok(preview.coneRisks.some((risk) => risk.id === "cone"));
    assert.match(buildAimingBallisticsPreviewHtml(preview), /Line Friend/);
    assert.match(buildAimingBallisticsPreviewHtml(preview), /Очередь/);
});

test("aiming ballistics preview ignores melee and throwing attacks", () => {
    const preview = buildAimingBallisticsPreview({
        sourceToken: makeToken({ id: "source", x: 0, y: 0 }),
        targetToken: makeToken({ id: "target", x: 1000, y: 0 }),
        item: { system: { weaponType: "melee" } },
        attack: { dmg: "12", bullets: 1 },
        tokens: []
    });

    assert.equal(preview.enabled, false);
});
