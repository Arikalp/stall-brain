import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import {
  findVendorByWhatsappPhone,
  getVendorProfile,
  saveVendorProfile,
} from '../store/firestore.js'
import {
  formatCompactHindiMessage,
  parseWhatsappReply,
  sendWhatsAppMessage,
} from '../jobs/whatsappMorning.js'
import { todayIso } from '../utils/dates.js'

export const whatsappRouter = Router()

/**
 * Extracts normalized `{ from, text }` from Meta WhatsApp Cloud API,
 * Twilio webhooks, or direct JSON test payloads.
 */
export function extractIncomingMessage(body) {
  // Meta Cloud API shape
  const metaMsg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (metaMsg?.from && metaMsg?.text?.body) {
    return { from: metaMsg.from, text: metaMsg.text.body, source: 'meta' }
  }
  // Twilio webhook shape
  if (body?.From && body?.Body) {
    return { from: body.From, text: body.Body, source: 'twilio' }
  }
  // Direct JSON payload { from, text }
  if (body?.from && body?.text) {
    return { from: body.from, text: body.text, source: 'direct' }
  }
  return null
}

/** Webhook verification challenge (Meta WhatsApp Cloud API). */
whatsappRouter.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.whatsappVerifyToken) {
    return res.status(200).send(String(challenge ?? ''))
  }
  return res.status(403).json({ error: 'FORBIDDEN', message: 'Invalid verify token.' })
})

/** Incoming vendor WhatsApp replies: "1" (approve), edits, or "STOP" (opt-out). */
whatsappRouter.post('/whatsapp/webhook', async (req, res) => {
  const incoming = extractIncomingMessage(req.body)
  if (!incoming) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const parsed = parseWhatsappReply(incoming.text)
  const vendor = await findVendorByWhatsappPhone(incoming.from)

  if (!vendor) {
    return res.status(200).json({
      ok: true,
      matchedVendor: false,
      action: parsed.action,
      note: 'No opted-in vendor matched this phone number.',
    })
  }

  let replyText = 'समझ नहीं आया — मंज़ूर के लिए 1 लिखें, या बंद करने के लिए STOP लिखें।'

  if (parsed.action === 'opt_out') {
    await saveVendorProfile(vendor.vendorId, {
      ...vendor.profile,
      whatsappOptIn: false,
    })
    replyText = 'आपकी सुबह 6 बजे की WhatsApp सेवा बंद कर दी गई है। प्रोफ़ाइल से फिर चालू कर सकते हैं।'
  } else if (parsed.action === 'approve') {
    replyText = '✅ बढ़िया! आज का खरीद प्लान मंज़ूर हो गया है। अच्छी बिक्री की शुभकामनाएँ!'
  } else if (parsed.action === 'edit') {
    const editSummary = parsed.edits
      .map((e) => `${e.item}: ${e.quantity}${e.unit ? ` ${e.unit}` : ''}`)
      .join(', ')
    replyText = `✏️ बदलाव नोट कर लिए गए हैं (${editSummary})। आपका अपडेटेड प्लान तैयार है!`
  }

  const receipt = await sendWhatsAppMessage({
    to: incoming.from,
    body: replyText,
  }).catch(() => ({ sent: false }))

  return res.json({
    ok: true,
    matchedVendor: true,
    vendorId: vendor.vendorId,
    action: parsed.action,
    edits: parsed.edits ?? [],
    replySent: Boolean(receipt?.sent),
    isMock: Boolean(receipt?.isMock),
  })
})

const PreviewSchema = z.object({
  phone: z.string().trim().min(7).max(24).optional(),
  plan: z
    .object({
      procurementList: z.array(z.any()).default([]),
      financials: z.any().optional(),
      tomorrowOutlook: z.string().nullish(),
    })
    .optional(),
  stallLabel: z.string().optional(),
  send: z.boolean().default(false),
})

/** Authenticated vendor preview / test dispatch for their morning WhatsApp briefing. */
whatsappRouter.post(
  '/whatsapp/preview',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = PreviewSchema.safeParse(req.body ?? {})
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Invalid WhatsApp preview request.',
      })
    }

    try {
      const { profile } = await getVendorProfile(req.vendorId)
      const phone = parsedBody.data.phone ?? profile?.whatsappPhone ?? ''
      const message = formatCompactHindiMessage({
        plan: parsedBody.data.plan ?? { procurementList: [] },
        stallLabel: parsedBody.data.stallLabel ?? profile?.stallLabel ?? 'आपका ठेला',
        date: todayIso(),
      })

      let receipt = null
      if (parsedBody.data.send && phone) {
        receipt = await sendWhatsAppMessage({ to: phone, body: message })
      }

      return res.json({
        ok: true,
        message,
        receipt,
      })
    } catch (error) {
      return next(error)
    }
  },
)

