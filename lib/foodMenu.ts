export const FOOD_MENU_MARKER = "[[eya:food-menu]]";

export type FoodMenuOption = {
  id: string;
  name: string;
  priceDelta: number;
};

export type FoodMenuSection = {
  id: string;
  title: string;
  selection: "single" | "multiple";
  required: boolean;
  options: FoodMenuOption[];
};

export type FoodMenuConfig = {
  version: 1;
  sections: FoodMenuSection[];
};

export type FoodMenuSelectionMap = Record<string, string[]>;

export type ParsedFoodDescription = {
  description: string;
  menuConfig: FoodMenuConfig | null;
};

export type FoodSelectionSummary = {
  selections: { sectionTitle: string; optionNames: string[] }[];
  missingRequiredSectionIds: string[];
  selectedOptionNames: string[];
  unitPrice: number;
  itemTitle: string;
  summaryText: string;
};

const DEFAULT_BASE_OPTIONS = ["Rice", "Nsima", "Spaghetti", "Macaroni"];
const DEFAULT_ADDON_OPTIONS = [
  { name: "Chicken", priceDelta: 2500 },
  { name: "Beef", priceDelta: 2200 },
  { name: "Sausage", priceDelta: 1800 },
  { name: "Fish", priceDelta: 2800 },
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeOption(input: Partial<FoodMenuOption> | null | undefined, fallbackPrefix: string, index: number): FoodMenuOption | null {
  const name = String(input?.name ?? "").trim();
  if (!name) return null;
  return {
    id: String(input?.id || `${fallbackPrefix}-${slugify(name) || index + 1}`),
    name,
    priceDelta: normalizeMoney(Number(input?.priceDelta ?? 0)),
  };
}

function normalizeSection(input: Partial<FoodMenuSection> | null | undefined, index: number): FoodMenuSection | null {
  const title = String(input?.title ?? "").trim();
  const options = Array.isArray(input?.options)
    ? input.options
        .map((option, optionIndex) => normalizeOption(option, `section-${index + 1}`, optionIndex))
        .filter(Boolean) as FoodMenuOption[]
    : [];
  if (!title || !options.length) return null;
  const selection = input?.selection === "multiple" ? "multiple" : "single";
  return {
    id: String(input?.id || `section-${index + 1}-${slugify(title) || index + 1}`),
    title,
    selection,
    required: Boolean(input?.required),
    options,
  };
}

export function normalizeFoodMenuConfig(input: Partial<FoodMenuConfig> | null | undefined): FoodMenuConfig | null {
  if (!input?.sections || !Array.isArray(input.sections)) return null;
  const sections = input.sections
    .map((section, index) => normalizeSection(section, index))
    .filter(Boolean) as FoodMenuSection[];
  if (!sections.length) return null;
  return {
    version: 1,
    sections,
  };
}

export function buildDefaultFoodMenuConfig(): FoodMenuConfig {
  return {
    version: 1,
    sections: [
      {
        id: "base-choice",
        title: "Choose your base",
        selection: "single",
        required: true,
        options: DEFAULT_BASE_OPTIONS.map((name, index) => ({
          id: `base-${index + 1}-${slugify(name)}`,
          name,
          priceDelta: 0,
        })),
      },
      {
        id: "protein-add-ons",
        title: "Add protein",
        selection: "multiple",
        required: false,
        options: DEFAULT_ADDON_OPTIONS.map((option, index) => ({
          id: `protein-${index + 1}-${slugify(option.name)}`,
          name: option.name,
          priceDelta: option.priceDelta,
        })),
      },
    ],
  };
}

export function encodeFoodDescription(description: string, menuConfig: FoodMenuConfig | null) {
  const cleanDescription = description.trim();
  const normalizedConfig = normalizeFoodMenuConfig(menuConfig);
  if (!normalizedConfig) return cleanDescription || null;
  const serialized = JSON.stringify(normalizedConfig);
  return `${cleanDescription}${cleanDescription ? "\n\n" : ""}${FOOD_MENU_MARKER}${serialized}`;
}

export function parseFoodDescription(raw: string | null | undefined): ParsedFoodDescription {
  const text = String(raw ?? "");
  const markerIndex = text.indexOf(FOOD_MENU_MARKER);
  if (markerIndex < 0) {
    return {
      description: text.trim(),
      menuConfig: null,
    };
  }

  const description = text.slice(0, markerIndex).trim();
  const metaText = text.slice(markerIndex + FOOD_MENU_MARKER.length).trim();
  try {
    return {
      description,
      menuConfig: normalizeFoodMenuConfig(JSON.parse(metaText)),
    };
  } catch {
    return {
      description,
      menuConfig: null,
    };
  }
}

export function getDefaultFoodSelections(menuConfig: FoodMenuConfig | null | undefined): FoodMenuSelectionMap {
  if (!menuConfig?.sections?.length) return {};
  return Object.fromEntries(
    menuConfig.sections.map((section) => {
      if (section.selection === "single" && section.required && section.options[0]) {
        return [section.id, [section.options[0].id]];
      }
      return [section.id, []];
    }),
  );
}

export function summarizeFoodMenu(menuConfig: FoodMenuConfig | null | undefined) {
  if (!menuConfig?.sections?.length) return "";
  return menuConfig.sections
    .map((section) => {
      const optionNames = section.options.slice(0, 4).map((option) => option.name);
      return optionNames.length ? `${section.title}: ${optionNames.join(", ")}` : "";
    })
    .filter(Boolean)
    .join(" - ");
}

export function getFoodPriceRange(basePrice: number, menuConfig: FoodMenuConfig | null | undefined) {
  const normalizedBase = normalizeMoney(basePrice);
  if (!menuConfig?.sections?.length) {
    return { minimum: normalizedBase, maximum: normalizedBase };
  }

  let maximum = normalizedBase;
  for (const section of menuConfig.sections) {
    if (section.selection === "single") {
      maximum += Math.max(...section.options.map((option) => option.priceDelta), 0);
      continue;
    }
    maximum += section.options.reduce((sum, option) => sum + option.priceDelta, 0);
  }

  return {
    minimum: normalizedBase,
    maximum,
  };
}

export function buildFoodSelectionSummary(
  mealName: string,
  basePrice: number,
  menuConfig: FoodMenuConfig | null | undefined,
  selections: FoodMenuSelectionMap | null | undefined,
): FoodSelectionSummary {
  const normalizedBase = normalizeMoney(basePrice);
  if (!menuConfig?.sections?.length) {
    return {
      selections: [],
      missingRequiredSectionIds: [],
      selectedOptionNames: [],
      unitPrice: normalizedBase,
      itemTitle: mealName,
      summaryText: mealName,
    };
  }

  const selectionMap = selections ?? {};
  const sectionSelections: { sectionTitle: string; optionNames: string[] }[] = [];
  const selectedOptionNames: string[] = [];
  const missingRequiredSectionIds: string[] = [];
  let unitPrice = normalizedBase;

  for (const section of menuConfig.sections) {
    const selectedIds = Array.isArray(selectionMap[section.id]) ? selectionMap[section.id] : [];
    const uniqueIds = Array.from(new Set(selectedIds));
    const resolvedOptions = section.options.filter((option) => uniqueIds.includes(option.id));
    if (section.required && !resolvedOptions.length) {
      missingRequiredSectionIds.push(section.id);
      continue;
    }
    if (!resolvedOptions.length) continue;

    if (section.selection === "single") {
      const chosen = resolvedOptions[0];
      unitPrice += chosen.priceDelta;
      sectionSelections.push({ sectionTitle: section.title, optionNames: [chosen.name] });
      selectedOptionNames.push(chosen.name);
      continue;
    }

    unitPrice += resolvedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const optionNames = resolvedOptions.map((option) => option.name);
    sectionSelections.push({ sectionTitle: section.title, optionNames });
    selectedOptionNames.push(...optionNames);
  }

  const suffix = selectedOptionNames.length ? ` (${selectedOptionNames.join(", ")})` : "";
  return {
    selections: sectionSelections,
    missingRequiredSectionIds,
    selectedOptionNames,
    unitPrice,
    itemTitle: `${mealName}${suffix}`,
    summaryText: selectedOptionNames.length ? selectedOptionNames.join(" - ") : mealName,
  };
}
