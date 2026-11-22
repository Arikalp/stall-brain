/**
 * MOCK DATA - wholesale/mandi buy prices and indicative realized selling value
 * per ingredient unit (Lucknow catchment).
 * data.gov.in (Agmarknet) needs an API key; until one is configured this mock
 * fixture is used and is clearly labeled `isMock: true` in every tool output.
 *
 * `sellPricePerUnit` is an indicative revenue realized per unit of ingredient
 * sold (e.g. 1 kg aloo sold as chaat yields ~₹65), used as a MOCK fallback
 * when the vendor has not entered their own selling prices in Profile (T3.2).
 */

export const mockMandiPrices = [
  { item: 'aloo', pricePerUnit: 22, sellPricePerUnit: 65, unit: 'kg' },
  { item: 'chhole', pricePerUnit: 85, sellPricePerUnit: 210, unit: 'kg' },
  { item: 'puri', pricePerUnit: 90, sellPricePerUnit: 240, unit: 'kg' },
  { item: 'imli chutney', pricePerUnit: 160, sellPricePerUnit: 320, unit: 'litres' },
  { item: 'sev', pricePerUnit: 140, sellPricePerUnit: 280, unit: 'kg' },
  { item: 'dahi', pricePerUnit: 60, sellPricePerUnit: 135, unit: 'litres' },
  { item: 'seasonal fruits', pricePerUnit: 60, sellPricePerUnit: 150, unit: 'kg' },
  { item: 'sugarcane', pricePerUnit: 18, sellPricePerUnit: 55, unit: 'kg' },
  { item: 'cups', pricePerUnit: 2, sellPricePerUnit: 5, unit: 'pieces' },
  { item: 'straws', pricePerUnit: 0.5, sellPricePerUnit: 1.5, unit: 'pieces' },
  { item: 'ice', pricePerUnit: 10, sellPricePerUnit: 25, unit: 'kg' },
  { item: 'roses', pricePerUnit: 8, sellPricePerUnit: 20, unit: 'pieces' },
  { item: 'marigold', pricePerUnit: 3, sellPricePerUnit: 8, unit: 'pieces' },
  { item: 'jasmine garlands', pricePerUnit: 25, sellPricePerUnit: 60, unit: 'pieces' },
  { item: 'leaves', pricePerUnit: 1, sellPricePerUnit: 3, unit: 'pieces' },
  { item: 'mixture', pricePerUnit: 130, sellPricePerUnit: 240, unit: 'kg' },
  { item: 'mathi', pricePerUnit: 12, sellPricePerUnit: 25, unit: 'pieces' },
  { item: 'chips', pricePerUnit: 10, sellPricePerUnit: 20, unit: 'packets' },
  { item: 'packaging pouches', pricePerUnit: 0.8, sellPricePerUnit: 2, unit: 'pieces' },
  { item: 'milk', pricePerUnit: 55, sellPricePerUnit: 145, unit: 'litres' },
  { item: 'tea leaves', pricePerUnit: 280, sellPricePerUnit: 850, unit: 'kg' },
  { item: 'sugar', pricePerUnit: 42, sellPricePerUnit: 100, unit: 'kg' },
  { item: 'gas cylinders', pricePerUnit: 850, sellPricePerUnit: 1100, unit: 'pieces' },
  { item: 'corn cobs', pricePerUnit: 12, sellPricePerUnit: 35, unit: 'pieces' },
  { item: 'butter', pricePerUnit: 320, sellPricePerUnit: 600, unit: 'kg' },
  { item: 'masala', pricePerUnit: 180, sellPricePerUnit: 450, unit: 'kg' },
  { item: 'charcoal', pricePerUnit: 25, sellPricePerUnit: 55, unit: 'kg' },
  { item: 'balloons', pricePerUnit: 1.5, sellPricePerUnit: 10, unit: 'pieces' },
  { item: 'small toys', pricePerUnit: 15, sellPricePerUnit: 40, unit: 'pieces' },
  { item: 'string', pricePerUnit: 20, sellPricePerUnit: 45, unit: 'packets' },
  { item: 'pump', pricePerUnit: 120, sellPricePerUnit: 150, unit: 'pieces' },
]
