/**
 * MOCK DATA - wholesale/mandi prices for key ingredients (Lucknow catchment).
 * data.gov.in (Agmarknet) needs an API key; until one is configured this mock
 * fixture is used and is clearly labeled `isMock: true` in every tool output.
 *
 * Prices are indicative per-unit rates in INR for a typical month; refresh
 * quarterly or wire the real Agmarknet feed in getMandiPrices.
 */

export const mockMandiPrices = [
  { item: 'aloo', pricePerUnit: 22, unit: 'kg' },
  { item: 'chhole', pricePerUnit: 85, unit: 'kg' },
  { item: 'puri', pricePerUnit: 90, unit: 'kg' },
  { item: 'imli chutney', pricePerUnit: 160, unit: 'litres' },
  { item: 'sev', pricePerUnit: 140, unit: 'kg' },
  { item: 'dahi', pricePerUnit: 60, unit: 'litres' },
  { item: 'seasonal fruits', pricePerUnit: 60, unit: 'kg' },
  { item: 'sugarcane', pricePerUnit: 18, unit: 'kg' },
  { item: 'cups', pricePerUnit: 2, unit: 'pieces' },
  { item: 'straws', pricePerUnit: 0.5, unit: 'pieces' },
  { item: 'ice', pricePerUnit: 10, unit: 'kg' },
  { item: 'roses', pricePerUnit: 8, unit: 'pieces' },
  { item: 'marigold', pricePerUnit: 3, unit: 'pieces' },
  { item: 'jasmine garlands', pricePerUnit: 25, unit: 'pieces' },
  { item: 'leaves', pricePerUnit: 1, unit: 'pieces' },
  { item: 'mixture', pricePerUnit: 130, unit: 'kg' },
  { item: 'mathi', pricePerUnit: 12, unit: 'pieces' },
  { item: 'chips', pricePerUnit: 10, unit: 'packets' },
  { item: 'packaging pouches', pricePerUnit: 0.8, unit: 'pieces' },
  { item: 'milk', pricePerUnit: 55, unit: 'litres' },
  { item: 'tea leaves', pricePerUnit: 280, unit: 'kg' },
  { item: 'sugar', pricePerUnit: 42, unit: 'kg' },
  { item: 'gas cylinders', pricePerUnit: 850, unit: 'pieces' },
  { item: 'corn cobs', pricePerUnit: 12, unit: 'pieces' },
  { item: 'butter', pricePerUnit: 320, unit: 'kg' },
  { item: 'masala', pricePerUnit: 180, unit: 'kg' },
  { item: 'charcoal', pricePerUnit: 25, unit: 'kg' },
  { item: 'balloons', pricePerUnit: 1.5, unit: 'pieces' },
  { item: 'small toys', pricePerUnit: 15, unit: 'pieces' },
  { item: 'string', pricePerUnit: 20, unit: 'packets' },
  { item: 'pump', pricePerUnit: 120, unit: 'pieces' },
]
