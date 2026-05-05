import { Z_DIFFICULTY } from "../difficulty-tables.js";
import {
  Z_SOCIAL_SKILLS,
  buildSocialCheckContext,
  buildSocialCardHtml,
  getSocialAttitudeMeta,
  getSocialPresetLabel
} from "../social-check.js";
import { rollD100 } from "../roll-utils.js";

export class ZSocialCheckDialog extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
    this.state = {
      skillId: options.skillId || "diplomacy",
      targetUuid: options.targetUuid || this._getDefaultTargetUuid(),
      customModifier: Number(options.customModifier) || 0,
      customModifierInput: String(Number(options.customModifier) || 0),
      rollMode: options.rollMode || "roll"
    };
    this._onActorUpdate = this._onActorUpdate.bind(this);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "z-social-check-dialog",
      title: "Социальная проверка",
      template: "systems/zsystem/sheets/apps/social-check-dialog.hbs",
      width: 460,
      height: "auto",
      classes: ["zsystem", "social-check-dialog"],
      resizable: false
    });
  }

  _getDefaultTargetUuid() {
    const targeted = Array.from(game.user.targets || [])[0];
    if (targeted?.document?.uuid) return targeted.document.uuid;
    const token = canvas.tokens.controlled.find((entry) => entry.actor?.id !== this.actor.id);
    return token?.document?.uuid || "";
  }

  _getTargetTokenOptions() {
    return canvas.tokens.placeables
      .filter((token) => token.actor && token.actor.id !== this.actor.id)
      .map((token) => ({
        uuid: token.document.uuid,
        name: token.name,
        actor: token.actor
      }));
  }

  async getData() {
    const targets = this._getTargetTokenOptions();
    const targetEntry = targets.find((entry) => entry.uuid === this.state.targetUuid) || null;
    const targetActor = targetEntry?.actor || null;
    const context = buildSocialCheckContext({
      actor: this.actor,
      skillId: this.state.skillId,
      targetActor,
      customModifier: this.state.customModifierInput ?? String(this.state.customModifier),
      tables: Z_DIFFICULTY.social
    });

    return {
      actor: this.actor,
      isGM: game.user.isGM,
      hideFactors: game.settings.get("zsystem", "hideSocialFactors"),
      skillId: this.state.skillId,
      targetUuid: this.state.targetUuid,
      customModifier: this.state.customModifier,
      rollMode: this.state.rollMode,
      skillOptions: Object.entries(Z_SOCIAL_SKILLS).map(([key, label]) => ({ key, label })),
      targetOptions: targets.map((entry) => ({ uuid: entry.uuid, name: entry.name })),
      preview: context,
      previewAttitude: getSocialAttitudeMeta(context.difficulty.profile.attitude),
      previewPresetLabel: getSocialPresetLabel(context.difficulty.profile.preset)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("select, input").on("change input", (event) => {
      const form = event.currentTarget.form;
      const data = new FormDataExtended(form).object;
      this.state.skillId = data.skillId || this.state.skillId;
      this.state.targetUuid = data.targetUuid || "";
      this.state.customModifierInput = String(data.customModifier ?? "");
      if (event.currentTarget.name === "customModifier" && event.type === "input") return;
      this.state.customModifier = Number(this.state.customModifierInput) || 0;
      this.state.rollMode = data.rollMode || "roll";
      this.render(false);
    });
  }

  async _render(...args) {
    Hooks.on("updateActor", this._onActorUpdate);
    return super._render(...args);
  }

  async close(options) {
    Hooks.off("updateActor", this._onActorUpdate);
    return super.close(options);
  }

  _onActorUpdate(actor) {
    if (!this.rendered) return;
    if (actor.id === this.actor.id) return this.render(false);
    const targetActor = canvas.tokens.placeables.find((token) => token.document.uuid === this.state.targetUuid)?.actor || null;
    if (targetActor?.id === actor.id) this.render(false);
  }

  async _updateObject(_event, formData) {
    const targetUuid = formData.targetUuid || "";
    const targetDoc = targetUuid ? await fromUuid(targetUuid) : null;
    const targetActor = targetDoc?.actor || null;

    const context = buildSocialCheckContext({
      actor: this.actor,
      skillId: formData.skillId,
      targetActor,
      customModifier: Number(formData.customModifier) || 0,
      tables: Z_DIFFICULTY.social
    });

    const roll = await rollD100();
    const revealFactors = game.user.isGM || !game.settings.get("zsystem", "hideSocialFactors");
    const card = buildSocialCardHtml({
      context,
      rollTotal: roll.total,
      revealFactors
    });

    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: card.content,
      flags: {
        zsystem: {
          type: "social-check",
          skillId: formData.skillId,
          targetName: targetActor?.name || "",
          descriptor: context.descriptor
        }
      }
    };
    ChatMessage.applyRollMode(chatData, formData.rollMode || "roll");
    await ChatMessage.create(chatData);

    if (!revealFactors && targetActor) {
      await ChatMessage.create({
        whisper: ChatMessage.getWhisperRecipients("GM"),
        content: `<div class="z-chat-card"><div class="z-card-header">Social GM: ${this.actor.name} → ${targetActor.name}</div><div style="font-size:0.85em; color:#bbb;">Ситуация: ${context.descriptor}</div><div style="margin-top:6px;">${context.difficulty.breakdown.filter((entry) => entry.value !== 0).map((entry) => `${entry.label}: ${entry.value > 0 ? "+" : ""}${entry.value}%`).join("<br>") || "Без модификаторов"}</div></div>`
      });
    }
  }
}

export function openSocialCheckDialog(actor, options = {}) {
  if (!actor) {
    ui.notifications.warn("Сначала выберите персонажа.");
    return null;
  }
  const app = new ZSocialCheckDialog(actor, options);
  app.render(true);
  return app;
}
