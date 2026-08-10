export function formatDisplayValue(value) {
  if (value === null || value === undefined) return "N/A";

  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDisplayValue(item)).join(", ");
  }

  if (type === "object") {
    if (typeof value.category === "string" && value.category.trim() !== "") {
      return value.category;
    }
    if (
      (typeof value.numeric === "number" && Number.isFinite(value.numeric)) ||
      typeof value.numeric === "string"
    ) {
      return String(value.numeric);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "N/A";
    }
  }

  return String(value);
}

