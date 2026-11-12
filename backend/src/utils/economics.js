import { mockMandiPrices } from '../data/prices.js'

/**
 * Deterministic cost, budget, and profit engine (T3.2).
 *
 * All INR arithmetic lives here in code — never in the LLM.
 * Pricing priority per item:
 *   1. Vendor-supplied `itemPrices[item]` (profile or session override) -> isMock: false
 *   2. Live/mock mandi signal `signals.prices` matching item
 *   3. `mockMandiPrices` fallback in data/prices.js -> isMock: true
 */

function round2(value) {
  return Math.round(value * 100) / 100
}

function floor2(value) {
  return Math.floor(value * 100 + 1e-9) / 100
}

function normalizeKey(name) {
  return String(name ?? '').trim().toLowerCase()
}

/** Parses "12 kg", "0.5 litre", "8" into numeric value (null if unparseable). */
export function parseNumericQuantity(text) {
  if (typeof text === 'number') {
    return Number.isFinite(text) ? text : null
  }
  if (typeof text !== 'string') return null
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

/** Looks up a vendor price entry case-insensitively. */
function findVendorPrice(item, vendorPrices) {
  if (!vendorPrices || typeof vendorPrices !== 'object') return null
  if (vendorPrices[item]) return vendorPrices[item]
  const target = normalizeKey(item)
  for (const [key, val] of Object.entries(vendorPrices)) {
    if (normalizeKey(key) === target) return val
  }
  return null
}

/**
 * Resolves per-unit buyPrice and sellPrice in INR for an item.
 * Returns { buyPrice, sellPrice, unitMargin, roiRatio, isMock }.
 */
export function resolveItemPricing(item, { vendorPrices, signalPrices } = {}) {
  const key = normalizeKey(item)
  const vendor = findVendorPrice(item, vendorPrices)
  const signal = Array.isArray(signalPrices)
    ? signalPrices.find((p) => normalizeKey(p?.item) === key)
    : null
  const mock = mockMandiPrices.find((p) => normalizeKey(p.item) === key) ?? null

  let buyPrice = null
  let buyIsMock = false
  if (Number.isFinite(Number(vendor?.buyPrice)) && vendor?.buyPrice != null) {
    buyPrice = Number(vendor.buyPrice)
    buyIsMock = false
  } else if (Number.isFinite(Number(signal?.pricePerUnit)) && signal?.pricePerUnit != null) {
    buyPrice = Number(signal.pricePerUnit)
    buyIsMock = Boolean(signal.isMock)
  } else if (mock && Number.isFinite(mock.pricePerUnit)) {
    buyPrice = mock.pricePerUnit
    buyIsMock = true
  }

  let sellPrice = null
  let sellIsMock = false
  if (Number.isFinite(Number(vendor?.sellPrice)) && vendor?.sellPrice != null) {
    sellPrice = Number(vendor.sellPrice)
    sellIsMock = false
  } else if (mock && Number.isFinite(mock.sellPricePerUnit)) {
    sellPrice = mock.sellPricePerUnit
    sellIsMock = true
  }

  const unitMargin =
    buyPrice != null && sellPrice != null ? round2(sellPrice - buyPrice) : null
  const roiRatio =
    buyPrice != null && buyPrice > 0 && unitMargin != null
      ? unitMargin / buyPrice
      : unitMargin ?? 0

  const hasAnyPrice = buyPrice != null || sellPrice != null
  const isMock = hasAnyPrice ? (buyIsMock || sellIsMock) : false

  return {
    buyPrice,
    sellPrice,
    unitMargin,
    roiRatio,
    isMock,
  }
}

/**
 * Optimizes draft procurement quantities to maximize expected profit under a
 * tight daily budget cap.
 *
 * Items with higher margin per rupee spent (`roiRatio`) and higher expected
 * demand value (`toBuy * sellPrice`) receive budget first. Lower-margin items
 * are scaled down or deferred to `toBuy = 0` so total procurement cost never
 * exceeds `budgetInr`.
 *
 * Pure: returns { items, budgetConstrained, unconstrainedCostInr }.
 */
export function optimizeDraftForBudget(draftItems, budgetInr) {
  const items = draftItems.map((item) => ({ ...item }))
  if (budgetInr == null || !Number.isFinite(Number(budgetInr))) {
    return {
      items,
      budgetConstrained: false,
      unconstrainedCostInr: round2(
        items.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0),
      ),
    }
  }

  const cap = Math.max(0, Number(budgetInr))
  const unconstrainedCostInr = round2(
    items.reduce((sum, item) => sum + (item.buyPrice != null ? item.toBuy * item.buyPrice : 0), 0),
  )

  if (unconstrainedCostInr <= cap + 1e-6) {
    return { items, budgetConstrained: false, unconstrainedCostInr }
  }

  // Sort purchasable items by profitability per rupee (ROI), then expected
  // demand revenue, then baseline demand so high-margin + high-demand items win.
  const rankedIndices = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.toBuy > 0)
    .sort((a, b) => {
      const aBuy = a.item.buyPrice ?? 0
      const bBuy = b.item.buyPrice ?? 0
      // Free/unpriced items cost 0 budget; place them first so they aren't dropped.
      if (aBuy <= 0 && bBuy > 0) return -1
      if (bBuy <= 0 && aBuy > 0) return 1

      const aRoi = a.item.roiRatio ?? 0
      const bRoi = b.item.roiRatio ?? 0
      if (Math.abs(bRoi - aRoi) > 1e-6) return bRoi - aRoi

      const aDemandValue = a.item.toBuy * (a.item.sellPrice ?? aBuy)
      const bDemandValue = b.item.toBuy * (b.item.sellPrice ?? bBuy)
      if (Math.abs(bDemandValue - aDemandValue) > 1e-6) {
        return bDemandValue - aDemandValue
      }

      return (b.item.baseline ?? 0) - (a.item.baseline ?? 0)
    })

  let remainingBudget = cap

  for (const { index } of rankedIndices) {
    const item = items[index]
    const buyPrice = item.buyPrice ?? 0

    if (buyPrice <= 0) {
      // Unpriced item costs ₹0 against the budget cap.
      continue
    }

    const desiredCost = item.toBuy * buyPrice
    if (desiredCost <= remainingBudget + 1e-9) {
      remainingBudget = Math.max(0, remainingBudget - desiredCost)
      continue
    }

    // Tight budget: buy as much as remaining budget allows (floored to 2 decimals
    // so rounding never pushes total cost over cap).
    const affordable = floor2(remainingBudget / buyPrice)
    const nextToBuy = Math.max(0, Math.min(item.toBuy, affordable))
    remainingBudget = Math.max(0, remainingBudget - nextToBuy * buyPrice)

    item.toBuy = round2(nextToBuy)
    item.totalNeeded = round2(item.alreadyHave + item.toBuy)
    item.estimatedCost = round2(item.toBuy * buyPrice)
    item.estimatedRevenue =
      item.sellPrice != null ? round2(item.totalNeeded * item.sellPrice) : 0
    item.estimatedProfit = round2(
      item.estimatedRevenue - item.totalNeeded * buyPrice,
    )
    item.budgetAdjusted = true
  }

  return {
    items,
    budgetConstrained: true,
    unconstrainedCostInr,
  }
}

/**
 * Computes deterministic cost, revenue, profit, and budget status for any
 * procurement list (`draftPlan.items` or `ForecastResult.procurementList`).
 *
 * Notice revenue/profit covers the *total* stock sold today (`totalNeeded`,
 * including what was already in stock) vs the procurement cash outflow today
 * (`toBuy * buyPrice`) and full COGS (`totalNeeded * buyPrice`).
 */
export function computePlanFinancials({
  procurementList = [],
  sufficientStockItems = [],
  draftPlan = null,
  vendorPrices = {},
  signalPrices = [],
  budgetInr = null,
} = {}) {
  let totalCostInr = 0
  let totalCogsInr = 0
  let expectedRevenueInr = 0
  let isMockPricing = false
  let hasAnyPricedItem = false
  const itemBreakdown = {}

  for (const row of procurementList) {
    const itemName = row?.item
    if (!itemName) continue

    const toBuyQty = parseNumericQuantity(row.toBuy) ?? 0
    const totalNeededQty = parseNumericQuantity(row.totalNeeded) ?? toBuyQty
    const pricing = resolveItemPricing(itemName, { vendorPrices, signalPrices })

    const buyPrice = pricing.buyPrice
    const sellPrice = pricing.sellPrice
    if (buyPrice != null || sellPrice != null) {
      hasAnyPricedItem = true
    }
    if (pricing.isMock) {
      isMockPricing = true
    }

    const costInr = buyPrice != null ? round2(toBuyQty * buyPrice) : 0
    const cogsInr = buyPrice != null ? round2(totalNeededQty * buyPrice) : 0
    const revenueInr = sellPrice != null ? round2(totalNeededQty * sellPrice) : 0
    const profitInr = round2(revenueInr - cogsInr)

    totalCostInr += costInr
    totalCogsInr += cogsInr
    expectedRevenueInr += revenueInr

    itemBreakdown[itemName] = {
      buyPrice,
      sellPrice,
      costInr,
      revenueInr,
      profitInr,
      isMock: pricing.isMock,
    }
  }

  // Sufficient-stock items also contribute revenue if priced, with ₹0 purchase cost today.
  for (const itemName of sufficientStockItems) {
    if (!itemName || itemBreakdown[itemName]) continue
    const pricing = resolveItemPricing(itemName, { vendorPrices, signalPrices })
    if (pricing.isMock) isMockPricing = true
    if (pricing.buyPrice != null || pricing.sellPrice != null) {
      hasAnyPricedItem = true
    }
    itemBreakdown[itemName] = {
      buyPrice: pricing.buyPrice,
      sellPrice: pricing.sellPrice,
      costInr: 0,
      revenueInr: 0,
      profitInr: 0,
      isMock: pricing.isMock,
    }
  }

  totalCostInr = round2(totalCostInr)
  totalCogsInr = round2(totalCogsInr)
  expectedRevenueInr = round2(expectedRevenueInr)
  const expectedProfitInr = round2(expectedRevenueInr - totalCogsInr)
  const marginPercent =
    expectedRevenueInr > 0
      ? round2((expectedProfitInr / expectedRevenueInr) * 100)
      : 0

  const numericBudget =
    budgetInr != null && Number.isFinite(Number(budgetInr))
      ? Number(budgetInr)
      : null

  return {
    totalCostInr,
    expectedRevenueInr,
    expectedProfitInr,
    marginPercent,
    budgetInr: numericBudget,
    withinBudget: numericBudget == null ? true : totalCostInr <= numericBudget + 0.5,
    budgetConstrained: Boolean(draftPlan?.budgetConstrained),
    isMockPricing: hasAnyPricedItem ? isMockPricing : false,
    items: itemBreakdown,
  }
}

