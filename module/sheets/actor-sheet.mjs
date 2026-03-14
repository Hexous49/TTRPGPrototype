export class MyTTRPGActorSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["myttrpg", "actor-sheet"],
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
      width: 620,
      height: 620,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.isCharacter = this.actor.type === "character";
    context.isNPC       = this.actor.type === "npc";

    // Hardcode English labels — game.i18n is not loading our lang file
    context.labels = {
      sectionHealth:      "Health",
      sectionAttributes:  "Attributes",
      sectionEquipment:   "Equipment",
      sectionBiography:   "Biography",
      sectionNotes:       "Notes",
      vitality:           "Vitality",
      poolName:           "Pool Name",
      addPool:            "Add Pool",
      editPool:           "Edit Pool",
      removePool:         "Remove Pool",
      totalHealth:        "Total",
      strength:           "Strength",
      agility:            "Agility",
      intellect:          "Intellect",
      cr:                 "CR",
      shieldGeneratorSlot: "Shield Generator",
      slotEmpty:          "Drop a Shield Generator here",
      unequip:            "Unequip",
    };

    // Build a plain system object with null-safe values.
    // totalHealth IS in the schema but overwritten by prepareDerivedData() —
    // read from the live system object so we always get the computed totals.
    const sys         = this.actor.system.toObject();
    const totalHealth = this.actor.system.totalHealth ?? { value: 0, max: 0 };

    // Resolve equipped shield item info for the template
    const equippedShieldId = sys.equippedShieldId ?? "";
    let equippedShield = null;
    if (equippedShieldId) {
      const shieldItem = this.actor.items.get(equippedShieldId);
      if (shieldItem) equippedShield = { id: shieldItem.id, name: shieldItem.name };
    }

    context.system = {
      vitality: {
        value: sys.vitality?.value ?? 0,
        max:   sys.vitality?.max   ?? 0,
      },
      pools: sys.pools ?? [],
      totalHealth: {
        value: totalHealth.value ?? 0,
        max:   totalHealth.max   ?? 0,
      },
      equippedShieldId,
      equippedShield,
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

    // expandObject leaves numeric-keyed pool children as objects — convert to array.
    // The form only submits `value` for each pool (name/max/sourceItemId are read-only
    // spans), so merge into existing pool records to preserve those fields.
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

    html.find(".add-pool").click((ev)    => this._onAddPool(ev));
    html.find(".edit-pool").click((ev)   => this._onEditPool(ev));
    html.find(".remove-pool").click((ev) => this._onRemovePool(ev));
    html.find(".unequip-shield").click(() => this._unequipShield());
  }

  // ─── Drop handling ────────────────────────────────────────────────────────

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await fromUuid(data.uuid);
    if (!item) return super._onDropItem(event, data);

    if (item.type === "shieldGenerator") {
      return this._equipShieldGenerator(item);
    }

    return super._onDropItem(event, data);
  }

  // ─── Equipment ────────────────────────────────────────────────────────────

  async _equipShieldGenerator(item) {
    // Swap out any already-equipped shield first
    if (this.actor.system.equippedShieldId) {
      await this._unequipShield(false);
    }

    // Embed a copy of the item on this actor
    const [embedded] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);

    // Add a pool sourced from this item (sourceItemId links pool ↔ item)
    const pools = [
      ...this.actor.system.toObject().pools,
      { name: embedded.name, value: 0, max: embedded.system.shieldMax, sourceItemId: embedded.id },
    ];

    await this.actor.update({
      "system.equippedShieldId": embedded.id,
      "system.pools": pools,
    });

    this.render(false);
  }

  async _unequipShield(rerender = true) {
    const equippedId = this.actor.system.equippedShieldId;
    if (!equippedId) return;

    // Remove the pool that was created for this item
    const pools = this.actor.system.toObject().pools
      .filter(p => p.sourceItemId !== equippedId);

    // Delete the embedded item document from the actor
    const embeddedItem = this.actor.items.get(equippedId);
    if (embeddedItem) await embeddedItem.delete();

    await this.actor.update({
      "system.equippedShieldId": "",
      "system.pools": pools,
    });

    if (rerender) this.render(false);
  }

  // ─── Health pools ─────────────────────────────────────────────────────────

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
            const pools = [...this.actor.system.toObject().pools, { name, value, max, sourceItemId: "" }];
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
    const btn        = ev.currentTarget;
    const isVitality = btn.dataset.type === "vitality";

    if (isVitality) {
      const currentMax = this.actor.system.toObject().vitality.max;
      new Dialog({
        title: "Edit Vitality",
        content: `
          <form>
            <div class="form-group">
              <label>Max</label>
              <input type="number" name="max" value="${currentMax}" min="0">
            </div>
          </form>
        `,
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
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
        },
        default: "save",
      }).render(true);

    } else {
      const index = Number(btn.dataset.index);
      const pool  = this.actor.system.toObject().pools[index];
      new Dialog({
        title: "Edit Pool",
        content: `
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
        `,
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
          cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
        },
        default: "save",
      }).render(true);
    }
  }

  async _onRemovePool(ev) {
    const index = Number(ev.currentTarget.dataset.index);
    const pools = this.actor.system.toObject().pools;
    const pool  = pools[index];

    const updates = { "system.pools": pools.filter((_, i) => i !== index) };

    // If this pool was created by an equipped item, also clean up the item slot
    if (pool.sourceItemId) {
      const embeddedItem = this.actor.items.get(pool.sourceItemId);
      if (embeddedItem) await embeddedItem.delete();
      if (this.actor.system.equippedShieldId === pool.sourceItemId) {
        updates["system.equippedShieldId"] = "";
      }
    }

    await this.actor.update(updates);
    this.render(false);
  }
}
