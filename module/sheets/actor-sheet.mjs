// Maps item type → { slotIdField, maxField? }.
// maxField is optional — omit it for items that don't add a health pool when equipped.
// To add a new equippable type: add one entry here and nowhere else.
const EQUIPMENT_SLOTS = {
  weapon:          { slotIdField: "equippedWeaponId"                        },
  shieldGenerator: { slotIdField: "equippedShieldId", maxField: "shieldMax" },
  armor:           { slotIdField: "equippedArmorId",  maxField: "armorMax"  },
};

const ITEM_TYPE_NAMES = {
  weapon:          "Weapon",
  skill:           "Skill",
  shieldGenerator: "Shield Generator",
  armor:           "Armor",
};

export class MyTTRPGActorSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["myttrpg", "actor-sheet"],
      template: "systems/myttrpg/templates/actor/actor-sheet.hbs",
      width: 620,
      height: 740,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.isCharacter = this.actor.type === "character";
    context.isNPC       = this.actor.type === "npc";

    context.labels = {
      sectionHealth:       "Health",
      sectionEquipment:    "Equipment",
      sectionInventory:    "Inventory",
      sectionAttributes:   "Attributes",
      sectionBiography:    "Biography",
      sectionNotes:        "Notes",
      vitality:            "Vitality",
      poolName:            "Pool Name",
      addPool:             "Add Pool",
      editPool:            "Edit Pool",
      removePool:          "Remove Pool",
      totalHealth:         "Total",
      strength:            "Strength",
      agility:             "Agility",
      intellect:           "Intellect",
      cr:                  "CR",
      weaponSlot:          "Weapon",
      shieldGeneratorSlot: "Shield Generator",
      armorSlot:           "Armor",
      slotEmpty:           "Drop here to equip",
      equip:               "Equip",
      stow:                "Stow (return to inventory)",
      deleteItem:          "Remove from inventory",
      inventoryEmpty:      "Drop items here to add them",
    };

    const sys         = this.actor.system.toObject();
    const totalHealth = this.actor.system.totalHealth ?? { value: 0, max: 0 };

    const resolveEquipped = (id) => {
      if (!id) return null;
      const item = this.actor.items.get(id);
      if (!item) return null;
      return {
        id:     item.id,
        name:   item.name,
        damage: item.system.damage ?? null,
        range:  item.system.range  ?? null,
      };
    };

    // Inventory = every embedded item that is NOT filling an equipment slot
    const equippedItemIds = new Set(
      Object.values(EQUIPMENT_SLOTS)
        .map(({ slotIdField }) => sys[slotIdField])
        .filter(Boolean)
    );

    const inventoryItems = [...this.actor.items]
      .filter(item => !equippedItemIds.has(item.id))
      .map(item => {
        const slotDef  = EQUIPMENT_SLOTS[item.type];
        // "Equip" is available when the item has a slot definition AND that slot is empty
        const canEquip    = !!(slotDef && !sys[slotDef.slotIdField]);
        // Only items that add a health pool (maxField defined) show a health display
        const healthMax   = slotDef?.maxField ? (item.system[slotDef.maxField] ?? 0) : null;
        const healthValue = slotDef?.maxField ? (item.system.currentValue ?? healthMax) : null;
        return {
          id:          item.id,
          name:        item.name,
          typeName:    ITEM_TYPE_NAMES[item.type] ?? item.type,
          canEquip,
          showHealth:  !!(slotDef?.maxField),
          healthValue,
          healthMax,
        };
      });

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
      equippedWeaponId: sys.equippedWeaponId ?? "",
      equippedWeapon:   resolveEquipped(sys.equippedWeaponId),
      equippedShieldId: sys.equippedShieldId ?? "",
      equippedShield:   resolveEquipped(sys.equippedShieldId),
      equippedArmorId:  sys.equippedArmorId  ?? "",
      equippedArmor:    resolveEquipped(sys.equippedArmorId),
      inventoryItems,
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

    // Health pools
    html.find(".add-pool").click((ev)    => this._onAddPool(ev));
    html.find(".edit-pool").click((ev)   => this._onEditPool(ev));
    html.find(".remove-pool").click((ev) => this._onRemovePool(ev));

    // Equipment slot: stow button returns item to inventory without deleting it
    html.find(".stow-btn").click((ev) => {
      this._stowFromSlot(ev.currentTarget.dataset.slot);
    });

    // Inventory: equip moves item into its slot; delete removes it entirely
    html.find(".equip-item-btn").click((ev) => {
      this._equipFromInventory(ev.currentTarget.dataset.itemId);
    });
    html.find(".delete-item-btn").click((ev) => {
      this._deleteInventoryItem(ev.currentTarget.dataset.itemId);
    });
  }

  // ─── Drop handling ────────────────────────────────────────────────────────
  // Items dropped anywhere on the sheet go to inventory first.
  // Equipping from inventory is done via the Equip button.
  // (No override needed — super._onDropItem embeds the item by default.)

  // ─── Equipment: Equip from inventory ─────────────────────────────────────

  async _equipFromInventory(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const slotDef = EQUIPMENT_SLOTS[item.type];
    if (!slotDef) return;
    if (this.actor.system[slotDef.slotIdField]) return; // slot already filled

    const updates = { [`system.${slotDef.slotIdField}`]: item.id };

    if (slotDef.maxField) {
      // Use the item's persisted currentValue if it has one; otherwise start at full health (max).
      const savedValue = item.system.currentValue ?? item.system[slotDef.maxField];
      updates["system.pools"] = [
        ...this.actor.system.toObject().pools,
        { name: item.name, value: savedValue, max: item.system[slotDef.maxField], sourceItemId: item.id },
      ];
    }

    await this.actor.update(updates);

    this.render(false);
  }

  // ─── Equipment: Stow from slot back to inventory ──────────────────────────

  async _stowFromSlot(slotIdField, rerender = true) {
    const equippedId = this.actor.system[slotIdField];
    if (!equippedId) return;

    // Persist the pool's current damage state back onto the embedded item
    // so re-equipping it later restores the same value.
    const allPools   = this.actor.system.toObject().pools;
    const pool       = allPools.find(p => p.sourceItemId === equippedId);
    const embeddedItem = this.actor.items.get(equippedId);
    if (pool && embeddedItem) {
      await embeddedItem.update({ "system.currentValue": pool.value });
    }

    // Remove the pool but keep the embedded item — it reappears in inventory
    const pools = allPools.filter(p => p.sourceItemId !== equippedId);

    await this.actor.update({
      [`system.${slotIdField}`]: "",
      "system.pools": pools,
    });

    if (rerender) this.render(false);
  }

  // ─── Inventory: Delete item ───────────────────────────────────────────────

  async _deleteInventoryItem(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Safety: clean up any dangling pool / slot references
    const pools   = this.actor.system.toObject().pools;
    const updates = {};

    if (pools.some(p => p.sourceItemId === itemId)) {
      updates["system.pools"] = pools.filter(p => p.sourceItemId !== itemId);
    }
    for (const { slotIdField } of Object.values(EQUIPMENT_SLOTS)) {
      if (this.actor.system[slotIdField] === itemId) {
        updates[`system.${slotIdField}`] = "";
      }
    }

    if (Object.keys(updates).length) await this.actor.update(updates);
    await item.delete();
    this.render(false);
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

    if (pool.sourceItemId) {
      // Persist current damage state onto the item before stowing it
      const embeddedItem = this.actor.items.get(pool.sourceItemId);
      if (embeddedItem) {
        await embeddedItem.update({ "system.currentValue": pool.value });
      }

      // Clear the equipment slot — item stays in inventory (not deleted)
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
