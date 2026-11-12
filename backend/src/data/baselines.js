/**
 * Baseline daily demand per stall type and item, in the unit the item is
 * stocked/sold in. These are starting estimates for a typical Hazratganj stall;
 * the learned bias factors (T2.3) correct them per vendor over time.
 *
 * Units follow the frontend's INVENTORY_UNITS: kg, g, litres, pieces, packets, dozen.
 */

export const stallBaselines = {
  chaat: {
    aloo: { baseline: 12, unit: 'kg', perishable: true, shelfLifeDays: 5 },
    chhole: { baseline: 6, unit: 'kg', perishable: true, shelfLifeDays: 7 },
    puri: { baseline: 300, unit: 'pieces', perishable: true, shelfLifeDays: 2 },
    'imli chutney': { baseline: 4, unit: 'litres', perishable: true, shelfLifeDays: 3 },
    sev: { baseline: 3, unit: 'kg', perishable: false, shelfLifeDays: 14 },
    dahi: { baseline: 8, unit: 'litres', perishable: true, shelfLifeDays: 2 },
  },
  juice: {
    'seasonal fruits': { baseline: 15, unit: 'kg', perishable: true, shelfLifeDays: 2 },
    sugarcane: { baseline: 20, unit: 'kg', perishable: true, shelfLifeDays: 3 },
    cups: { baseline: 250, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
    straws: { baseline: 300, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
    ice: { baseline: 10, unit: 'kg', perishable: true, shelfLifeDays: 1 },
  },
  flowers: {
    roses: { baseline: 200, unit: 'pieces', perishable: true, shelfLifeDays: 1 },
    marigold: { baseline: 300, unit: 'pieces', perishable: true, shelfLifeDays: 2 },
    'jasmine garlands': { baseline: 80, unit: 'pieces', perishable: true, shelfLifeDays: 1 },
    leaves: { baseline: 100, unit: 'pieces', perishable: true, shelfLifeDays: 2 },
  },
  snacks: {
    mixture: { baseline: 8, unit: 'kg', perishable: false, shelfLifeDays: 21 },
    mathi: { baseline: 60, unit: 'pieces', perishable: false, shelfLifeDays: 14 },
    chips: { baseline: 80, unit: 'packets', perishable: false, shelfLifeDays: 45 },
    'packaging pouches': { baseline: 150, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
  },
  chai: {
    milk: { baseline: 20, unit: 'litres', perishable: true, shelfLifeDays: 1 },
    'tea leaves': { baseline: 2, unit: 'kg', perishable: false, shelfLifeDays: 60 },
    sugar: { baseline: 5, unit: 'kg', perishable: false, shelfLifeDays: 90 },
    cups: { baseline: 300, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
    'gas cylinders': { baseline: 1, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
  },
  bhutta: {
    'corn cobs': { baseline: 150, unit: 'pieces', perishable: true, shelfLifeDays: 2 },
    butter: { baseline: 3, unit: 'kg', perishable: true, shelfLifeDays: 7 },
    masala: { baseline: 1, unit: 'kg', perishable: false, shelfLifeDays: 60 },
    charcoal: { baseline: 5, unit: 'kg', perishable: false, shelfLifeDays: 90 },
  },
  balloon: {
    balloons: { baseline: 200, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
    'small toys': { baseline: 40, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
    string: { baseline: 2, unit: 'packets', perishable: false, shelfLifeDays: 90 },
    pump: { baseline: 1, unit: 'pieces', perishable: false, shelfLifeDays: 90 },
  },
}

export function getShelfLifeEntry(item, stallType) {
  const key = String(item ?? '').trim().toLowerCase()
  if (stallType && stallBaselines[stallType]?.[key]) {
    const entry = stallBaselines[stallType][key]
    return {
      perishable: Boolean(entry.perishable),
      shelfLifeDays: entry.shelfLifeDays ?? 7,
      baseline: entry.baseline,
      unit: entry.unit,
    }
  }
  for (const group of Object.values(stallBaselines)) {
    if (group[key]) {
      return {
        perishable: Boolean(group[key].perishable),
        shelfLifeDays: group[key].shelfLifeDays ?? 7,
        baseline: group[key].baseline,
        unit: group[key].unit,
      }
    }
  }
  return { perishable: false, shelfLifeDays: 7, baseline: 1, unit: 'units' }
}

/**
 * Typical Hazratganj footfall pattern by weekday. Hazratganj is busiest on
 * weekends (Ganjing culture); Monday/Tuesday are the slow days.
 */
export const weekdayPattern = {
  Monday: 0.9,
  Tuesday: 0.9,
  Wednesday: 0.95,
  Thursday: 1.0,
  Friday: 1.1,
  Saturday: 1.25,
  Sunday: 1.2,
}

/** Footfall multiplier for festivals, by reported impact level. */
export const festivalImpact = {
  high: 1.4,
  medium: 1.2,
  low: 1.05,
}

/** Footfall multiplier for cricket match days at Ekana, by expected crowd. */
export const matchImpact = {
  high: 1.5,
  medium: 1.3,
  low: 1.1,
}

/** Footfall multiplier for local events/melas, by expected footfall level. */
export const eventImpact = {
  high: 1.4,
  medium: 1.2,
  low: 1.05,
}

/** Combined multipliers are clamped to this sane range. */
export const MULTIPLIER_BOUNDS = { min: 0.4, max: 2.5 }
