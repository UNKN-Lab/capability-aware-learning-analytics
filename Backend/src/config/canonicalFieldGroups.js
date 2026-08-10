import { CANONICAL_FIELDS } from "./canonicalFields.js";

export const CANONICAL_FIELD_GROUPS = CANONICAL_FIELDS.reduce((acc, field) => {
  if (!acc[field.group]) {
    acc[field.group] = [];
  }

  acc[field.group].push(field);
  return acc;
}, {});