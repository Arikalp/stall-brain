export const events = [
  {
    date: '2025-01-01',
    name: 'New Year Market Rush',
    type: 'public-holiday',
    impactMultiplier: 1.15,
  },
  {
    date: '2025-01-14',
    name: 'Makar Sankranti',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-01-26',
    name: 'Republic Day',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-02-02',
    name: 'Hazratganj Mahotsav',
    type: 'festival',
    impactMultiplier: 1.35,
  },
  {
    date: '2025-02-10',
    name: 'UP Elections (Tentative)',
    type: 'civic',
    impactMultiplier: 1.1,
  },
  {
    date: '2025-02-26',
    name: 'Maha Shivratri',
    type: 'public-holiday',
    impactMultiplier: 1.25,
  },
  {
    date: '2025-03-14',
    name: 'Holi',
    type: 'public-holiday',
    impactMultiplier: 1.5,
  },
  {
    date: '2025-03-31',
    name: 'Eid al-Fitr',
    type: 'public-holiday',
    impactMultiplier: 1.5,
  },
  {
    date: '2025-04-06',
    name: 'Ram Navami',
    type: 'public-holiday',
    impactMultiplier: 1.25,
  },
  {
    date: '2025-04-10',
    name: 'Mahavir Jayanti',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-04-14',
    name: 'Ambedkar Jayanti',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-04-18',
    name: 'Good Friday',
    type: 'public-holiday',
    impactMultiplier: 1.1,
  },
  {
    date: '2025-05-01',
    name: 'Labour Day',
    type: 'public-holiday',
    impactMultiplier: 1.1,
  },
  {
    date: '2025-05-12',
    name: 'Buddha Purnima',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-06-07',
    name: 'Eid al-Adha',
    type: 'public-holiday',
    impactMultiplier: 1.45,
  },
  {
    date: '2025-07-06',
    name: 'Muharram',
    type: 'public-holiday',
    impactMultiplier: 0.95,
  },
  {
    date: '2025-08-09',
    name: 'Raksha Bandhan',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-08-15',
    name: 'Independence Day',
    type: 'public-holiday',
    impactMultiplier: 1.3,
  },
  {
    date: '2025-08-16',
    name: 'Janmashtami',
    type: 'public-holiday',
    impactMultiplier: 1.25,
  },
  {
    date: '2025-08-27',
    name: 'Ganesh Chaturthi',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-09-05',
    name: 'Milad un-Nabi',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-09-22',
    name: 'Navratri Begins',
    type: 'festival',
    impactMultiplier: 1.35,
  },
  {
    date: '2025-10-02',
    name: 'Gandhi Jayanti',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-10-02',
    name: 'Dussehra',
    type: 'public-holiday',
    impactMultiplier: 1.35,
  },
  {
    date: '2025-10-20',
    name: 'Diwali',
    type: 'public-holiday',
    impactMultiplier: 1.6,
  },
  {
    date: '2025-11-05',
    name: 'Guru Nanak Jayanti',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-11-22',
    name: 'Lucknow Mahotsav',
    type: 'festival',
    impactMultiplier: 1.45,
  },
  {
    date: '2025-12-25',
    name: 'Christmas',
    type: 'public-holiday',
    impactMultiplier: 1.2,
  },
  {
    date: '2025-04-06',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
  {
    date: '2025-04-12',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
  {
    date: '2025-04-18',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
  {
    date: '2025-04-27',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
  {
    date: '2025-05-04',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
  {
    date: '2025-05-11',
    name: 'IPL LSG Home Match',
    type: 'sport',
    impactMultiplier: 1.4,
  },
]

export const weeklyPattern = {
  Monday: 0.8,
  Tuesday: 1,
  Wednesday: 1,
  Thursday: 1,
  Friday: 1.2,
  Saturday: 1.3,
  Sunday: 1.4,
}

export function getWeeklyMultiplier(dayName) {
  return weeklyPattern[dayName] ?? 1
}

export function getEventsForDate(dateString) {
  return events.filter((event) => event.date === dateString)
}
