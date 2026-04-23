import {
  Z_SOCIAL_ATTITUDES,
  getSocialAttitudeMeta,
  getSocialPresetLabel,
  getSocialProfile
} from "../social-check.js";
import { openSocialCheckDialog } from "./social-check-dialog.js";

export class ZCommunicationDialog extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
    this.state = {
      targetUuid: options.targetUuid || this._getDefaultTargetUuid()
    };
    this._onActorUpdate = this._onActorUpdate.bind(this);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "z-communication-dialog",
      title: "Общение",
      template: "systems/zsystem/sheets/apps/communication-dialog.hbs",
      width: 460,
      height: "auto",
      classes: ["zsystem", "communication-dialog"],
      resizable: false
    });
  }

  _getDefaultTargetUuid() {
    const targeted = Array.from(game.user.targets || [])[0];
    if (targeted?.document?.uuid) return targeted.document.uuid;
    const nearby = canvas.tokens.placeables.find((entry) => entry.actor && entry.actor.id !== this.actor.id);
    return nearby?.document?.uuid || "";
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
    const social = getSocialProfile(targetActor);
    const attitudeMeta = getSocialAttitudeMeta(social.attitude);

    return {
      actor: this.actor,
      isGM: game.user.isGM,
      targetUuid: this.state.targetUuid,
      targetOptions: targets.map((entry) => ({ uuid: entry.uuid, name: entry.name })),
      targetActor,
      social,
      attitudeMeta,
      attitudeOptions: Object.entries(Z_SOCIAL_ATTITUDES).map(([key, label]) => ({ key, label })),
      presetLabel: getSocialPresetLabel(social.preset)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('[name="targetUuid"]').change((event) => {
      this.state.targetUuid = event.currentTarget.value || "";
      this.render(false);
    });

    html.find(".comm-open-check").click(async (event) => {
      event.preventDefault();
      const skillId = event.currentTarget.dataset.skill || "diplomacy";
      openSocialCheckDialog(this.actor, {
        targetUuid: this.state.targetUuid,
        skillId
      });
      this.close();
    });

    html.find(".comm-open-sheet").click(async (event) => {
      event.preventDefault();
      const targetDoc = this.state.targetUuid ? await fromUuid(this.state.targetUuid) : null;
      if (targetDoc?.actor) targetDoc.actor.sheet.render(true);
    });

    html.find(".comm-set-attitude").click(async (event) => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const targetDoc = this.state.targetUuid ? await fromUuid(this.state.targetUuid) : null;
      if (!targetDoc?.actor || !["npc", "survivor"].includes(targetDoc.actor.type)) return;
      await targetDoc.actor.update({
        "system.social.attitude": event.currentTarget.dataset.attitude
      });
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

  async _updateObject() {}
}

export function openCommunicationDialog(actor, options = {}) {
  if (!actor) {
    ui.notifications.warn("Сначала выберите персонажа.");
    return null;
  }

  const app = new ZCommunicationDialog(actor, options);
  app.render(true);
  return app;
}
