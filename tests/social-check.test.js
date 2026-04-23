import test from "node:test";
import assert from "node:assert/strict";

import { Z_DIFFICULTY } from "../src/module/difficulty-tables.js";
import {
  buildSocialCheckContext,
  getSocialAttitudeMeta,
  getSocialDifficultyLabel,
  getSocialDifficultyModifier
} from "../src/module/social-check.js";

test("social modifier uses npc attitude and preset", () => {
  const modifier = getSocialDifficultyModifier({
    targetActor: {
      system: {
        social: {
          attitude: "hostile",
          preset: "hard"
        }
      }
    },
    tables: Z_DIFFICULTY.social
  });

  assert.equal(modifier.total, -30);
});

test("social modifier includes manual gm override", () => {
  const modifier = getSocialDifficultyModifier({
    targetActor: {
      system: {
        social: {
          attitude: "friendly",
          preset: "easy"
        }
      }
    },
    customModifier: -5,
    tables: Z_DIFFICULTY.social
  });

  assert.equal(modifier.total, 15);
});

test("social descriptor maps difficulty bands", () => {
  assert.equal(getSocialDifficultyLabel(20), "легко");
  assert.equal(getSocialDifficultyLabel(0), "обычно");
  assert.equal(getSocialDifficultyLabel(-10), "сложно");
  assert.equal(getSocialDifficultyLabel(-30), "опасно");
});

test("social context builds effective target from skill and difficulty", () => {
  const context = buildSocialCheckContext({
    actor: {
      system: {
        skills: {
          diplomacy: { value: 55 }
        }
      }
    },
    skillId: "diplomacy",
    targetActor: {
      system: {
        social: {
          attitude: "neutral",
          preset: "hard"
        }
      },
      name: "Рэй"
    },
    customModifier: 5,
    tables: Z_DIFFICULTY.social
  });

  assert.equal(context.effectiveTarget, 50);
  assert.equal(context.descriptor, "сложно");
  assert.equal(context.targetActor.name, "Рэй");
});

test("social attitude meta exposes label icon and color", () => {
  const meta = getSocialAttitudeMeta("hostile");
  assert.equal(meta.label.includes("Враж"), true);
  assert.equal(meta.icon, "😠");
  assert.equal(meta.color, "#e74c3c");
});
