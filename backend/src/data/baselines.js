/**
 * Baseline daily demand per stall type and item, in the unit the item is
 * stocked/sold in. These are starting estimates for a typical Hazratganj stall;
 * the learned bias factors (T2.3) correct them per vendor over time.
 *
 * Units follow the frontend's INVENTORY_UNITS: kg, g, litres, pieces, packets, dozen.
 */

export const stallBaselines = {
  chaat: {
    aloo: { baseline: 12, unit: 'kg' },
    chhole: { baseline: 6, unit: 'kg' },
    puri: { baseline: 300, unit: 'pieces' },
    'imli chutney': { baseline: 4, unit: 'litres' },
    sev: { baseline: 3, unit: 'kg' },
    dahi: { baseline: 8, unit: 'litres' },
  },
  juice: {
    'seasonal fruits': { baseline: 15, unit: 'kg' },
    sugarcane: { baseline: 20, unit: 'kg' },
    cups: { baseline: 250, unit: 'pieces' },
    straws: { baseline: 300, unit: 'pieces' },
    ice: { baseline: 10, unit: 'kg' },
  },
  flowers: {
    roses: { baseline: 200, unit: 'pieces' },
    marigold: { baseline: 300, unit: 'pieces' },
    'jasmine garlands': { baseline: 80, unit: 'pieces' },
    leaves: { baseline: 100, unit: 'pieces' },
  },
  snacks: {
    mixture: { baseline: 8, unit: 'kg' },
    mathi: { baseline: 60, unit: 'pieces' },
    chips: { baseline: 80, unit: 'packets' },
    'packaging pouches': { baseline: 150, unit: 'pieces' },
  },
  chai: {
    milk: { baseline: 20, unit: 'litres' },
    'tea leaves': { baseline: 2, unit: 'kg' },
    sugar: { baseline: 5, unit: 'kg' },
    cups: { baseline: 300, unit: 'pieces' },
    'gas cylinders': { baseline: 1, unit: 'pieces' },
  },
  bhutta: {
    'corn cobs': { baseline: 150, unit: 'pieces' },
    butter: { baseline: 3, unit: 'kg' },
    masala: { baseline: 1, unit: 'kg' },
    charcoal: { baseline: 5, unit: 'kg' },
  },
  balloon: {
    balloons: { baseline: 200, unit: 'pieces' },
    'small toys': { baseline: 40, unit: 'pieces' },
    string: { baseline: 2, unit: 'packets' },
    pump: { baseline: 1, unit: 'pieces' },
  },
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

/** Combined multipliers are clamped to this sane range. */
export const MULTIPLIER_BOUNDS = { min: 0.4, max: 2.5 }
