import { CANONICAL_FIELDS } from "./canonicalFields.js";

export const CANONICAL_FIELD_INDEX = Object.fromEntries(
  CANONICAL_FIELDS.map((field) => [field.name, field])
);