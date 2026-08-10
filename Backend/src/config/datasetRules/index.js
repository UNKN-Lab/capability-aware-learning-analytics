import { mapUciColumn } from "./uci.rules.js";
import { mapOuladColumn } from "./oulad.rules.js";
import { isUciDataset, isOuladDataset } from "../../utils/datasetUtils.js";

export function getDatasetRuleMapper(datasetName, sourceDataset) {
  if (isUciDataset(datasetName, sourceDataset)) {
    return mapUciColumn;
  }

  if (isOuladDataset(datasetName, sourceDataset)) {
    return mapOuladColumn;
  }

  return null;
}