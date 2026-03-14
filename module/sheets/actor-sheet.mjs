export class MyTTRPGActorSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["myttrpg", "actor-sheet"],
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
      width: 620,
      height: 560,
      resizable: true,
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.isCharacter = this.actor.type === "character";
    context.isNPC = this.actor.type === "npc";
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".add-pool").click(async (ev) => {
      const pools = [...this.actor.system.pools, { name: "New Pool", value: 0, max: 0 }];
      await this.actor.update({ "system.pools": pools });
    });

    html.find(".remove-pool").click(async (ev) => {
      const index = Number(ev.currentTarget.dataset.index);
      const pools = this.actor.system.pools.filter((_, i) => i !== index);
      await this.actor.update({ "system.pools": pools });
    });
  }
}
