import { validateMapping } from "./mappingValidation.service.js";
import { saveLearnedAlias } from "../repositories/aliasMemory.repository.js";

// ==========================================
// HELPERS
// ==========================================

function getCurrentIsoTimestamp() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}


// ==========================================
// MAIN SERVICE
// ==========================================

export async function confirmMapping({
  mappingConfig,
  originalMappingConfig,
  profilingResult,
  confirmedAt = null
}) {
  const confirmedMapping = deepClone(mappingConfig);

  confirmedMapping.mapping_status = "confirmed";
  confirmedMapping.confirmed_at = confirmedAt || getCurrentIsoTimestamp();

  // field_mappings được giữ nguyên sau deepClone — không cần transform thêm.

  const validationResult = validateMapping({
    mappingConfig: confirmedMapping,
    profilingResult,
    mode: "strict"
  });

  if (!validationResult.isValid) {
    const error = new Error("Mapping confirmation failed.");
    error.status = 400;
    error.code = "MAPPING_CONFIRMATION_FAILED";
    error.validationResult = validationResult;
    throw error;
  }

  // Learn from manual overrides
  if (originalMappingConfig && Array.isArray(originalMappingConfig.field_mappings)) {
    const originalMap = new Map(
      originalMappingConfig.field_mappings.map(m => [m.id, m])
    );

    for (const item of confirmedMapping.field_mappings) {
      if (item.status === "confirmed" && item.canonical_field && item.source_fields?.length > 0) {
        const originalItem = originalMap.get(item.id);
        if (originalItem && ["unmapped", "needs_review"].includes(originalItem.status)) {
           // User manually mapped this field!
           const rawColumn = item.source_fields[0];
           await saveLearnedAlias(rawColumn, item.canonical_field);
        }
      }
    }
  }

  return {
    mappingConfig: confirmedMapping,
    validationResult
  };
}