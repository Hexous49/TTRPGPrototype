const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class MyTTRPGActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["myttrpg", "actor-sheet"],
    position: { width: 620, height: 560 },
    actions: {
      addPool: MyTTRPGActorSheet.#addPool,
      removePool: MyTTRPGActorSheet.#removePool,
    },
    form: {
      handler: MyTTRPGActorSheet.#onSubmit,
      submitOnChange: true,
    },
  };

  static PARTS = {
    form: {
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      isCharacter: this.actor.type === "character",
      isNPC: this.actor.type === "npc",
    };
  }

  static async #onSubmit(event, form, formData) {
    await this.actor.update(formData.object);
  }

  static async #addPool(event, target) {
    const pools = [...this.actor.system.pools, { name: "New Pool", value: 0, max: 0 }];
    await this.actor.update({ "system.pools": pools });
  }

  static async #removePool(event, target) {
    const index = Number(target.dataset.index);
    const pools = this.actor.system.pools.filter((_, i) => i !== index);
    await this.actor.update({ "system.pools": pools });
  }
}
