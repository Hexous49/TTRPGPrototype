const { fields } = foundry.data;

const healthPoolSchema = () => new fields.SchemaField({
  name: new fields.StringField({ required: true, initial: "" }),
  value: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
  max: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
});

export class MyTTRPGCharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      vitality: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 10 }),
        max: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 10 }),
      }),
      pools: new fields.ArrayField(healthPoolSchema()),
      attributes: new fields.SchemaField({
        strength: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 20, initial: 10 }),
        agility: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 20, initial: 10 }),
        intellect: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 20, initial: 10 }),
      }),
      biography: new fields.HTMLField(),
    };
  }

  static get trackableAttributes() {
    return {
      bar: [["vitality", "value"]],
      value: [
        ["attributes", "strength"],
        ["attributes", "agility"],
        ["attributes", "intellect"],
      ],
    };
  }
}

export class MyTTRPGNPCData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      vitality: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 5 }),
        max: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 5 }),
      }),
      pools: new fields.ArrayField(healthPoolSchema()),
      cr: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
      notes: new fields.HTMLField(),
    };
  }

  static get trackableAttributes() {
    return {
      bar: [["vitality", "value"]],
      value: [],
    };
  }
}

export class MyTTRPGWeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      damage: new fields.StringField({ initial: "1d6" }),
      range: new fields.StringField({ initial: "melee" }),
      description: new fields.HTMLField(),
    };
  }
}

export class MyTTRPGSkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      rank: new fields.NumberField({ required: true, integer: true, min: 0, max: 5, initial: 0 }),
      attribute: new fields.StringField({ initial: "strength" }),
      description: new fields.HTMLField(),
    };
  }
}
