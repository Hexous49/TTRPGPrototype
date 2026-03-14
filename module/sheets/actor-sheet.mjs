// Maps item type → { slotIdField, maxField } so _equipItem/_unequipSlot
// can work generically.  Add a new entry here whenever a new equippable
// item type is introduced.
const EQUIPMENT_SLOTS = {
  shieldGenerator: { slotIdField: "equippedShieldId", maxField: "shieldMax" },
  armor:           { slotIdField: "equippedArmorId",  maxField: "armorMax"  },
};

export class MyTTRPGActorSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["myttrpg", "actor-sheet"],
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
      width: 620,
      height: 680,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.isCharacter = this.actor.type === "character";
    context.isNPC       = this.actor.type === "npc";

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
      armorSlot:          "Armor",
      slotEmpty:          "Drop here to equip",
      unequip:            "Unequip",
    };

    const sys         = this.actor.system.toObject();
    const totalHealth = this.actor.system.totalHealth ?? { value: 0, max: 0 };

    // Helper: resolve an equipped item ID to { id, name } or null
    const resolveEquipped = (id) => {
      if (!id) return null;
      const item = this.actor.items.get(id);
      return item ? { id: item.id, name: item.name } : null;
    };

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
      equippedShieldId: sys.equippedShieldId ?? "",
      equippedShield:   resolveEquipped(sys.equippedShieldId),
      equippedArmorId:  sys.equippedArmorId  ?? "",
      equippedArmor:    resolveEquipped(sys.equippedArmorId),
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

    html.find("input, textarea, select").change((ev) => this._onSubmit(ev));

    html.find(".add-pool").click((ev)    => this._onAddPool(ev));
    html.find(".edit-pool").click((ev)   => this._onEditPool(ev));
    html.find(".remove-pool").click((ev) => this._onRemovePool(ev));

    // One listener per slot — each button carries a data-slot attribute
    // matching the slotIdField so _unequipSlot knows which slot to clear.
    html.find(".unequip-btn").click((ev) => {
      const slot = ev.currentTarget.dataset.slot;
      this._unequipSlot(slot);
    });
  }

  // ─── Drop handling ────────────────────────────────────────────────────────

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await fromUuid(data.uuid);
    if (!item) return super._onDropItem(event, data);

    const slotDef = EQUIPMENT_SLOTS[item.type];
    if (slotDef) return this._equipItem(item, slotDef.slotIdField, slotDef.maxField);

    return super._onDropItem(event, data);
  }

  // ─── Generic equip / unequip ──────────────────────────────────────────────

  async _equipItem(item, slotIdField, maxField) {
    // Swap out whatever is already in this slot
    if (this.actor.system[slotIdField]) {
      await this._unequipSlot(slotIdField, false);
    }

    const [embedded] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);

    const pools = [
      ...this.actor.system.toObject().pools,
      { name: embedded.name, value: 0, max: embedded.system[maxField], sourceItemId: embedded.id },
    ];

    await this.actor.update({
      [`system.${slotIdField}`]: embedded.id,
      "system.pools": pools,
    });

    this.render(false);
  }

  async _unequipSlot(slotIdField, rerender = true) {
    const equippedId = this.actor.system[slotIdField];
    if (!equippedId) return;

    const pools = this.actor.system.toObject().pools
      .filter(p => p.sourceItemId !== equippedId);

    const embeddedItem = this.actor.items.get(equippedId);
    if (embeddedItem) await embeddedItem.delete();

    await this.actor.update({
      [`system.${slotIdField}`]: "",
      "system.pools": pools,
    });

    if (rerender) this.render(false);
  }

  // ─── Health pools ─────────────────────────────────────────────────────────

  _onAddPool(ev) {
    new Dialog({
      title: "Add Health Pool",
      content: `
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
      `,
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
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
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

    // If this pool was created by an equipped item, clean up that slot too
    if (pool.sourceItemId) {
      const embeddedItem = this.actor.items.get(pool.sourceItemId);
      if (embeddedItem) await embeddedItem.delete();

      // Clear whichever equipment slot referenced this item
      for (const { slotIdField } of Object.values(EQUIPMENT_SLOTS)) {
        if (this.actor.system[slotIdField] === pool.sourceItemId) {
          updates[`system.${slotIdField}`] = "";
        }
      }
    }

    await this.actor.update(updates);
    this.render(false);
  }
}
