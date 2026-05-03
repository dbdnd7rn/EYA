const FOOD_MENU_MARKER = "[[eya:food-menu]]";

function normalizeMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOption(option) {
  const name = typeof option?.name === "string" ? option.name.trim() : "";
  if (!name) return null;
  return {
    id: typeof option?.id === "string" && option.id.trim() ? option.id.trim() : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    priceDelta: normalizeMoney(option?.priceDelta),
  };
}

function normalizeSection(section) {
  const title = typeof section?.title === "string" ? section.title.trim() : "";
  const options = asArray(section?.options).map(normalizeOption).filter(Boolean);
  if (!title || !options.length) return null;
  return {
    id: typeof section?.id === "string" && section.id.trim() ? section.id.trim() : title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    selection: section?.selection === "multiple" ? "multiple" : "single",
    required: Boolean(section?.required),
    options,
  };
}

export function parseFoodDescription(raw) {
  const text = typeof raw === "string" ? raw : "";
  const markerIndex = text.indexOf(FOOD_MENU_MARKER);
  if (markerIndex < 0) {
    return { description: text.trim(), menuConfig: null };
  }

  const description = text.slice(0, markerIndex).trim();
  const metaText = text.slice(markerIndex + FOOD_MENU_MARKER.length).trim();
  try {
    const parsed = JSON.parse(metaText);
    const sections = asArray(parsed?.sections).map(normalizeSection).filter(Boolean);
    return {
      description,
      menuConfig: sections.length ? { version: 1, sections } : null,
    };
  } catch {
    return { description, menuConfig: null };
  }
}

export function buildFoodOrderSnapshot(itemName, basePrice, description, foodCustomization) {
  const parsed = parseFoodDescription(description);
  const menuConfig = parsed.menuConfig;
  const selectionMap = foodCustomization && typeof foodCustomization === "object" ? foodCustomization.selection_map || {} : {};
  if (!menuConfig?.sections?.length) {
    return {
      itemNameSnapshot: itemName,
      unitPrice: normalizeMoney(basePrice),
    };
  }

  const chosenNames = [];
  let unitPrice = normalizeMoney(basePrice);

  for (const section of menuConfig.sections) {
    const requestedIds = asArray(selectionMap?.[section.id]).filter((value) => typeof value === "string");
    const matchedOptions = section.options.filter((option) => requestedIds.includes(option.id));
    if (!matchedOptions.length) continue;

    if (section.selection === "single") {
      const chosen = matchedOptions[0];
      chosenNames.push(chosen.name);
      unitPrice += normalizeMoney(chosen.priceDelta);
      continue;
    }

    for (const option of matchedOptions) {
      chosenNames.push(option.name);
      unitPrice += normalizeMoney(option.priceDelta);
    }
  }

  return {
    itemNameSnapshot: chosenNames.length ? `${itemName} (${chosenNames.join(", ")})` : itemName,
    unitPrice,
  };
}
