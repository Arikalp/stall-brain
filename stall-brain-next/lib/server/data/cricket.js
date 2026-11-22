/**
 * MOCK DATA - Ekana Cricket Stadium fixtures. There is no free fixture API
 * that covers IPL/domestic/international matches without a key, so this is a
 * curated mock fixture, clearly labeled as mock (also flagged in tool output).
 *
 * Replace `getCricketSchedule` internals with a real provider when available;
 * the tool contract stays the same.
 */

export const mockEkanaFixtures = [
  { date: '2026-04-05', teams: 'LSG vs CSK', venue: 'Ekana Stadium, Lucknow', startTime: '7:30 PM', expectedCrowd: 'high' },
  { date: '2026-04-12', teams: 'LSG vs MI', venue: 'Ekana Stadium, Lucknow', startTime: '3:30 PM', expectedCrowd: 'high' },
  { date: '2026-04-19', teams: 'LSG vs RCB', venue: 'Ekana Stadium, Lucknow', startTime: '7:30 PM', expectedCrowd: 'high' },
  { date: '2026-04-26', teams: 'LSG vs KKR', venue: 'Ekana Stadium, Lucknow', startTime: '7:30 PM', expectedCrowd: 'medium' },
  { date: '2026-05-03', teams: 'LSG vs GT', venue: 'Ekana Stadium, Lucknow', startTime: '7:30 PM', expectedCrowd: 'high' },
  { date: '2026-05-10', teams: 'LSG vs DC', venue: 'Ekana Stadium, Lucknow', startTime: '3:30 PM', expectedCrowd: 'medium' },
  { date: '2026-10-15', teams: 'India vs South Africa (T20)', venue: 'Ekana Stadium, Lucknow', startTime: '7:00 PM', expectedCrowd: 'high' },
]
