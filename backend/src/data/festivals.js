/**
 * CURATED festival calendar for Lucknow (Hindu + Islamic + national holidays,
 * local melas) with the expected footfall effect for vendors.
 *
 * NOTE: Islamic holiday dates shift with the moon; approximate dates are
 * flagged with `approximate: true`. Regenerate yearly, or let the agent's
 * web-search tool correct entries when it is configured.
 *
 * impactMultiplier folds into the event factor via gatherSignals.
 */

export const festivals = [
  { date: '2026-01-01', name: 'New Year Market Rush', impactMultiplier: 1.15 },
  { date: '2026-01-14', name: 'Makar Sankranti', impactMultiplier: 1.2 },
  { date: '2026-01-26', name: 'Republic Day', impactMultiplier: 1.2 },
  { date: '2026-02-15', name: 'Maha Shivratri', impactMultiplier: 1.25 },
  { date: '2026-03-04', name: 'Holi', impactMultiplier: 1.5 },
  { date: '2026-03-20', name: 'Eid al-Fitr', impactMultiplier: 1.5, approximate: true },
  { date: '2026-03-27', name: 'Ram Navami', impactMultiplier: 1.25 },
  { date: '2026-04-01', name: 'Mahavir Jayanti', impactMultiplier: 1.2 },
  { date: '2026-04-03', name: 'Good Friday', impactMultiplier: 1.1 },
  { date: '2026-04-14', name: 'Ambedkar Jayanti', impactMultiplier: 1.2 },
  { date: '2026-05-01', name: 'Buddha Purnima', impactMultiplier: 1.2 },
  { date: '2026-05-27', name: 'Eid al-Adha', impactMultiplier: 1.45, approximate: true },
  { date: '2026-06-25', name: 'Muharram', impactMultiplier: 0.95, approximate: true },
  { date: '2026-08-15', name: 'Independence Day', impactMultiplier: 1.3 },
  { date: '2026-08-28', name: 'Raksha Bandhan', impactMultiplier: 1.2 },
  { date: '2026-09-04', name: 'Janmashtami', impactMultiplier: 1.25 },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', impactMultiplier: 1.2 },
  { date: '2026-10-02', name: 'Gandhi Jayanti', impactMultiplier: 1.2 },
  { date: '2026-10-11', name: 'Navratri Begins', impactMultiplier: 1.35, approximate: true },
  { date: '2026-11-08', name: 'Diwali', impactMultiplier: 1.6, approximate: true },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', impactMultiplier: 1.2 },
  { date: '2026-12-25', name: 'Christmas', impactMultiplier: 1.2 },
]

/**
 * Local Lucknow events/melas (not festivals): markets, expos, mahotsavs.
 * Distances are from Hazratganj in km.
 */
export const localEvents = [
  { date: '2026-01-10', name: 'Lucknow Mahotsav', impactMultiplier: 1.45, distanceKm: 3 },
  { date: '2026-02-02', name: 'Hazratganj Heritage Walk & Market Fair', impactMultiplier: 1.35, distanceKm: 0.5 },
  { date: '2026-10-25', name: 'Janpath Exhibition Season', impactMultiplier: 1.2, distanceKm: 0.3 },
  { date: '2026-11-01', name: 'Lucknow Design Bazaar', impactMultiplier: 1.25, distanceKm: 1 },
  { date: '2026-12-05', name: 'Lucknow Mahotsav (Winter Edition)', impactMultiplier: 1.45, distanceKm: 3 },
]

/** Lucknow wedding-season windows: heavy demand for flowers, sweets, catering. */
export const weddingSeasonWindows = [
  { start: '2026-01-15', end: '2026-02-28', name: 'Wedding Season (Winter)' },
  { start: '2026-04-20', end: '2026-05-15', name: 'Wedding Season (Spring)' },
  { start: '2026-11-15', end: '2026-12-15', name: 'Wedding Season (Peak)', impactMultiplier: 1.3 },
]

/** Days a festival boosts footfall (eve + day). */
export const FESTIVAL_LOOKAHEAD_DAYS = 1
/** How many days ahead the events tool covers (per plan: today + next 3). */
export const EVENT_WINDOW_DAYS = 3
