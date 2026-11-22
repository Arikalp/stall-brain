import cron from 'node-cron'
import { config } from '../config.js'
import { getWhatsappOptedInVendors } from '../store/firestore.js'
import { computeDraftPlan } from '../graph/nodes/forecast.js'
import { stallBaselines } from '../data/baselines.js'
import { dayNameFor, todayIso } from '../utils/dates.js'

/**
 * Formats a compact Hindi WhatsApp morning plan for the vendor (T3.6).
 */
export function formatCompactHindiMessage({ plan, stallLabel = 'आपका ठेला', date = todayIso() }) {
  const buyLines = (plan?.procurementList ?? [])
    .slice(0, 6)
    .map((row) => `• ${row.item}: ${row.toBuy}`)

  const itemsBlock = buyLines.length
    ? buyLines.join('\n')
    : '• आज खरीदने की ज़रूरत नहीं — स्टॉक पूरा है।'

  const financials = plan?.financials
  const econLine =
    financials && financials.totalCostInr > 0
      ? `\nअनुमानित खर्च: ₹${financials.totalCostInr} | संभावित मुनाफ़ा: ₹${financials.expectedProfitInr}`
      : ''

  const outlook = plan?.tomorrowOutlook
    ? `\nकल का अनुमान: ${String(plan.tomorrowOutlook).split('||').pop()?.trim()}`
    : ''

  return [
    `🙏 सुप्रभात! ${stallLabel} (${date})`,
    `आज का खरीद प्लान:`,
    itemsBlock,
    econLine,
    outlook,
    ``,
    `मंज़ूर करने के लिए *1* लिखें | बदलने के लिए *item मात्रा* लिखें | बंद करने के लिए *STOP* लिखें।`,
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
}

/**
 * Parses an incoming WhatsApp vendor reply (T3.6):
 * - "1" / "ok" / "haan" / "approve" -> approve
 * - "STOP" / "opt out" / "band"     -> opt_out
 * - "<item> <qty> [unit]"           -> edit
 */
export function parseWhatsappReply(rawText) {
  const text = String(rawText ?? '').trim()
  const lower = text.toLowerCase()

  if (!lower) return { action: 'unknown', raw: text }

  if (/^(stop|opt[\s-]?out|unsubscribe|cancel|band)\b/i.test(lower)) {
    return { action: 'opt_out', raw: text }
  }

  if (/^(1|yes|ok|okay|haan|ha|approved?|done|मंज़ूर|ठीक)$/i.test(lower)) {
    return { action: 'approve', raw: text }
  }

  // Parse comma/newline-separated item edits, e.g. "aloo 15 kg, dahi 5 litres"
  const parts = text.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)
  const edits = []
  for (const part of parts) {
    const m = part.match(/^(?:change\s+)?([a-zA-Z\s]+?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/i)
    if (m) {
      edits.push({
        item: m[1].trim().toLowerCase(),
        quantity: Number(m[2]),
        unit: m[3] ? m[3].trim().toLowerCase() : null,
      })
    }
  }
  if (edits.length > 0) {
    return { action: 'edit', edits, raw: text }
  }

  return { action: 'unknown', raw: text }
}

/**
 * Sends a WhatsApp text via Cloud API or Twilio when configured, otherwise
 * returns a clearly labeled dry-run/mock receipt (never crashes when unconfigured).
 */
export async function sendWhatsAppMessage({ to, body, fetchImpl = fetch } = {}) {
  const recipient = String(to ?? '').trim()
  if (!recipient) {
    return { sent: false, provider: 'none', isMock: true, reason: 'missing phone number' }
  }

  if (config.whatsappToken && config.whatsappPhoneNumberId) {
    const url = `https://graph.facebook.com/v20.0/${config.whatsappPhoneNumberId}/messages`
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient.replace(/[^\d]/g, ''),
        type: 'text',
        text: { body },
      }),
    })
    if (!resp.ok) {
      throw new Error(`WhatsApp Cloud API responded ${resp.status}`)
    }
    const payload = await resp.json()
    return {
      sent: true,
      provider: 'whatsapp-cloud',
      isMock: false,
      messageId: payload?.messages?.[0]?.id ?? null,
      to: recipient,
    }
  }

  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioWhatsappFrom) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`
    const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64')
    const params = new URLSearchParams({
      From: config.twilioWhatsappFrom,
      To: recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`,
      Body: body,
    })
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!resp.ok) {
      throw new Error(`Twilio WhatsApp API responded ${resp.status}`)
    }
    const payload = await resp.json()
    return {
      sent: true,
      provider: 'twilio',
      isMock: false,
      messageId: payload?.sid ?? null,
      to: recipient,
    }
  }

  // Dry-run fallback when provider credentials are omitted.
  return {
    sent: true,
    provider: 'dry-run',
    isMock: true,
    to: recipient,
    body,
  }
}

/**
 * Runs one 6 AM IST morning dispatch batch for all opted-in vendors.
 */
export async function runMorningWhatsAppJob({ db, fetchImpl = fetch, date = todayIso() } = {}) {
  const vendors = await getWhatsappOptedInVendors({ db })
  const results = []

  for (const vendor of vendors) {
    const profile = vendor.profile ?? {}
    if (!profile.whatsappPhone) continue
    try {
      const items = profile.ingredients?.length
        ? profile.ingredients
        : Object.keys(stallBaselines[profile.stallType] ?? {})
      const draft = computeDraftPlan({
        stallType: profile.stallType,
        items,
        inventory: {},
        multiplier: { weather: 1, event: 1, weekday: 1, combined: 1 },
        signals: {},
        bias: {},
        budgetInr: profile.dailyBudgetInr ?? null,
        itemPrices: profile.itemPrices ?? {},
        date,
      })
      const plan = {
        procurementList: draft.items.map((d) => ({
          item: d.item,
          toBuy: `${d.toBuy} ${d.unit}`,
          unit: d.unit,
        })),
        financials: draft.financials,
      }
      const body = formatCompactHindiMessage({
        plan,
        stallLabel: profile.stallLabel || `${dayNameFor(date)} Stall`,
        date,
      })
      const receipt = await sendWhatsAppMessage({
        to: profile.whatsappPhone,
        body,
        fetchImpl,
      })
      results.push({ vendorId: vendor.vendorId, ...receipt })
    } catch (error) {
      results.push({
        vendorId: vendor.vendorId,
        sent: false,
        error: error?.message ?? String(error),
      })
    }
  }

  return { date, processed: vendors.length, results }
}

/**
 * Registers the 6:00 AM Asia/Kolkata daily cron job. Call only during server start().
 */
export function scheduleMorningWhatsappCron() {
  if (!config.whatsappCronEnabled) return null
  const task = cron.schedule(
    '0 6 * * *',
    () => {
      runMorningWhatsAppJob().catch((error) => {
        console.error('[whatsapp-cron] Morning dispatch error:', error?.message ?? error)
      })
    },
    { timezone: 'Asia/Kolkata' },
  )
  return task
}

