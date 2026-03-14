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

    html.find(".add-pool").click((ev) => this._onAddPool(ev));
    html.find(".remove-pool").click((ev) => this._onRemovePool(ev));
  }

  _onAddPool(ev) {
    const content = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize("MYTTRPG.Health.pool.name")}</label>
          <input type="text" name="name" value="" placeholder="${game.i18n.localize("MYTTRPG.Health.pool.name")}">
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("MYTTRPG.Health.pool.value")}</label>
          <input type="number" name="value" value="0" min="0">
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("MYTTRPG.Health.pool.max")}</label>
          <input type="number" name="max" value="0" min="0">
        </div>
      </form>
    `;

    new Dialog({
      title: game.i18n.localize("MYTTRPG.Health.addPool.title"),
      content,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("MYTTRPG.Health.addPool.confirm"),
          callback: async (html) => {
            const name = html.find('[name="name"]').val().trim() || game.i18n.localize("MYTTRPG.Health.pool.default");
            const value = parseInt(html.find('[name="value"]').val()) || 0;
            const max = parseInt(html.find('[name="max"]').val()) || 0;
            const pools = [...this.actor.system.toObject().pools, { name, value, max }];
            await this.actor.update({ "system.pools": pools });
            this.render(false);
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel"),
        },
      },
      default: "create",
    }).render(true);
  }

  async _onRemovePool(ev) {
    const index = Number(ev.currentTarget.dataset.index);
    const pools = this.actor.system.toObject().pools.filter((_, i) => i !== index);
    await this.actor.update({ "system.pools": pools });
    this.render(false);
  }
}
