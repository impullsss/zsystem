import {
    Z_SKILL_CHECK_SCENARIOS,
    Z_SKILL_DIFFICULTY_PRESETS,
    Z_SKILL_LABELS,
    buildSkillCheckCardHtml,
    buildSkillCheckContext
} from "../skill-check.js";
import { rollD100 } from "../roll-utils.js";

export class ZSkillCheckDialog extends FormApplication {
    constructor(actor, options = {}) {
        super(actor, options);
        this.actor = actor;
        this.state = {
            skillId: options.skillId || Object.keys(actor?.system?.skills || {})[0] || "medical",
            difficultyPreset: options.difficultyPreset || "normal",
            modifier: Number(options.modifier) || 0,
            modifierInput: String(Number(options.modifier) || 0),
            rollMode: options.rollMode || "roll"
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "z-skill-check-dialog",
            title: "Проверка навыка",
            template: "systems/zsystem/sheets/apps/skill-check-dialog.hbs",
            width: 460,
            height: "auto",
            classes: ["zsystem", "skill-check-dialog"],
            resizable: false
        });
    }

    getData() {
        const context = buildSkillCheckContext({
            actor: this.actor,
            skillId: this.state.skillId,
            modifier: this.state.modifierInput ?? String(this.state.modifier),
            preset: this.state.difficultyPreset
        });

        return {
            actor: this.actor,
            skillId: this.state.skillId,
            difficultyPreset: this.state.difficultyPreset,
            modifier: this.state.modifier,
            rollMode: this.state.rollMode,
            skillOptions: Object.entries(this.actor?.system?.skills || {}).map(([key]) => ({
                key,
                label: Z_SKILL_LABELS[key] || key
            })),
            difficultyOptions: Object.entries(Z_SKILL_DIFFICULTY_PRESETS).map(([key, preset]) => ({
                key,
                label: preset.label,
                dc: preset.dc
            })),
            scenarioOptions: Object.entries(Z_SKILL_CHECK_SCENARIOS)
                .filter(([, scenario]) => this.actor?.system?.skills?.[scenario.skillId])
                .map(([key, scenario]) => ({
                    key,
                    label: scenario.label,
                    skillId: scenario.skillId,
                    difficultyPreset: scenario.difficultyPreset,
                    modifier: scenario.modifier
                })),
            preview: context
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find("select, input").on("change input", (event) => {
            const form = event.currentTarget.form;
            const data = new FormDataExtended(form).object;
            this.state.skillId = data.skillId || this.state.skillId;
            this.state.difficultyPreset = data.difficultyPreset || this.state.difficultyPreset;
            this.state.modifierInput = String(data.modifier ?? "");
            if (event.currentTarget.name === "modifier" && event.type === "input") return;
            this.state.modifier = Number(this.state.modifierInput) || 0;
            this.state.rollMode = data.rollMode || "roll";
            this.render(false);
        });

        html.find(".z-skill-check-scenario").on("click", (event) => {
            const button = event.currentTarget;
            this.state.skillId = button.dataset.skillId || this.state.skillId;
            this.state.difficultyPreset = button.dataset.difficultyPreset || this.state.difficultyPreset;
            this.state.modifier = Number(button.dataset.modifier) || 0;
            this.state.modifierInput = String(this.state.modifier);
            this.render(false);
        });
    }

    async _updateObject(_event, formData) {
        const context = buildSkillCheckContext({
            actor: this.actor,
            skillId: formData.skillId,
            modifier: Number(formData.modifier) || 0,
            preset: formData.difficultyPreset || "normal"
        });
        const roll = await rollD100();
        const card = buildSkillCheckCardHtml({
            context,
            rollTotal: roll.total
        });

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: card.content,
            flags: {
                zsystem: {
                    type: "skill",
                    key: formData.skillId,
                    model: "skill-vs-difficulty",
                    difficulty: context.difficulty.total,
                    successChance: context.effectiveTarget,
                    resultType: card.resultType
                }
            }
        }, {
            rollMode: formData.rollMode || "roll"
        });
    }
}

export function openSkillCheckDialog(actor, options = {}) {
    if (!actor) {
        ui.notifications.warn("Сначала выберите персонажа.");
        return null;
    }
    const app = new ZSkillCheckDialog(actor, options);
    app.render(true);
    return app;
}
