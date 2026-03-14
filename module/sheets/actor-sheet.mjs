export class MyTTRPGActorSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["myttrpg", "actor-sheet"],
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
      width: 620,
      height: 560,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.isCharacter = this.actor.type === "character";
    context.isNPC = this.actor.type === "npc";

    // Hardcode English labels — game.i18n is not loading our lang file
    context.labels = {
      sectionHealth:     "Health",
      sectionAttributes: "Attributes",
      sectionBiography:  "Biography",
      sectionNotes:      "Notes",
      vitality:          "Vitality",
      poolName:          "Pool Name",
      addPool:           "Add Pool",
      editPool:          "Edit Pool",
      removePool:        "Remove Pool",
      strength:          "Strength",
      agility:           "Agility",
      intellect:         "Intellect",
      cr:                "CR",
    };

    // Build a plain system object with null-safe values so number inputs never render empty
    const sys = this.actor.system.toObject();
    context.system = {
      vitality: {
        value: sys.vitality?.value  ?? 0,
        max:   sys.vitality?.max    ?? 0,
      },
      pools: sys.pools ?? [],
      attributes: {
        strength:  sys.attributes?.strength  ?? 10,
        agility:   sys.attributes?.agility   ?? 10,
        intellect: sys.attributes?.intellect ?? 10,
      },
      biography: sys.biography ?? "",
      notes:     sys.notes     ?? "",
      cr:        sys.cr        ?? 1,
    };

    return context;
  }

  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);

    // expandObject leaves numeric-keyed children as objects — convert pools to array.
    // The form only submits `value` for each pool (name and max are now read-only spans),
    // so we merge the incoming form data into the existing pool records to preserve name and max.
    if (expanded.system?.pools && !Array.isArray(expanded.system.pools)) {
      const existing = this.actor.system.toObject().pools;
      const incoming = Object.values(expanded.system.pools);
      expanded.system.pools = existing.map((pool, i) => ({
        ...pool,
        ...(incoming[i] ?? {}),
      }));
    }

    return this.actor.update(expanded);
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Manually save on any field change (submitOnChange is unreliable in appv1 on v13)
    html.find("input, textarea, select").change((ev) => this._onSubmit(ev));

    html.find(".add-pool").click((ev) => this._onAddPool(ev));
    html.find(".edit-pool").click((ev) => this._onEditPool(ev));
    html.find(".remove-pool").click((ev) => this._onRemovePool(ev));
  }

  _onAddPool(ev) {
    const content = `
      <form>
        <div class="form-group">
          <label>Pool Name</label>
          <input type="text" name="name" value="" placeholder="Pool Name">
        </div>
        <div class="form-group">
          <label>Current</label>
          <input type="number" name="value" value="0" min="0">
        </div>
        <div class="form-group">
          <label>Max</label>
          <input type="number" name="max" value="0" min="0">
        </div>
      </form>
    `;

    new Dialog({
      title: "Add Health Pool",
      content,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Add",
          callback: async (html) => {
            const name  = html.find('[name="name"]').val().trim() || "New Pool";
            const value = parseInt(html.find('[name="value"]').val()) || 0;
            const max   = parseInt(html.find('[name="max"]').val())   || 0;
            const pools = [...this.actor.system.toObject().pools, { name, value, max }];
            await this.actor.update({ "system.pools": pools });
            this.render(false);
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      default: "create",
    }).render(true);
  }

  _onEditPool(ev) {
    const btn = ev.currentTarget;
    const isVitality = btn.dataset.type === "vitality";

    if (isVitality) {
      const currentMax = this.actor.system.toObject().vitality.max;
      const content = `
        <form>
          <div class="form-group">
            <label>Max</label>
            <input type="number" name="max" value="${currentMax}" min="0">
          </div>
        </form>
      `;

      new Dialog({
        title: "Edit Vitality",
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: "Save",
            callback: async (html) => {
              const max = parseInt(html.find('[name="max"]').val()) || 0;
              await this.actor.update({ "system.vitality.max": max });
              this.render(false);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
          },
        },
        default: "save",
      }).render(true);

    } else {
      const index = Number(btn.dataset.index);
      const pool  = this.actor.system.toObject().pools[index];
      const content = `
        <form>
          <div class="form-group">
            <label>Pool Name</label>
            <input type="text" name="name" value="${pool.name}" placeholder="Pool Name">
          </div>
          <div class="form-group">
            <label>Max</label>
            <input type="number" name="max" value="${pool.max}" min="0">
          </div>
        </form>
      `;

      new Dialog({
        title: "Edit Pool",
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: "Save",
            callback: async (html) => {
              const name = html.find('[name="name"]').val().trim() || pool.name;
              const max  = parseInt(html.find('[name="max"]').val()) || 0;
              const pools = this.actor.system.toObject().pools;
              pools[index] = { ...pools[index], name, max };
              await this.actor.update({ "system.pools": pools });
              this.render(false);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
          },
        },
        default: "save",
      }).render(true);
    }
  }

  async _onRemovePool(ev) {
    const index = Number(ev.currentTarget.dataset.index);
    const pools = this.actor.system.toObject().pools.filter((_, i) => i !== index);
    await this.actor.update({ "system.pools": pools });
    this.render(false);
  }
}
