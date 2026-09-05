import { parseMenuValue } from './parseMenu.js';

// Reverse-engineered from umassdining.com's own site scripts (the same calls
// its official mobile app and website make client-side). Unofficial and
// undocumented, so this may break if UMass changes their site.
const LOCATIONS_URL = 'https://www.umassdining.com/uapp/get_infov2';
const MENU_URL = 'https://umassdining.com/foodpro-menu-ajax';

export const DINING_HALLS = [
  { id: 1, name: 'Worcester Commons' },
  { id: 2, name: 'Franklin Dining Commons' },
  { id: 3, name: 'Hampshire Dining Commons' },
  { id: 4, name: 'Berkshire Dining Commons' },
];

function formatDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function normalizeMealPeriod(key) {
  const k = key.toLowerCase();
  if (k.includes('breakfast')) return 'breakfast';
  if (k.includes('dinner')) return 'dinner';
  if (k.includes('late')) return 'latenight';
  return 'lunch';
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchDiningHallStatuses() {
  const res = await fetch(LOCATIONS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`UMass Dining locations request failed: ${res.status}`);
  const data = await res.json();
  const knownIds = new Set(DINING_HALLS.map(h => h.id));

  return data
    .filter(loc => knownIds.has(loc.location_id))
    .map(loc => ({
      id: loc.location_id,
      name: loc.short_name,
      openingHours: loc.opening_hours,
      closingHours: loc.closing_hours,
      open24: loc.open_24 === 1,
      address: loc.address ? stripHtml(loc.address) : undefined,
    }));
}

export async function fetchHallMenu(hallId, date = new Date()) {
  const hall = DINING_HALLS.find(h => h.id === hallId);
  const url = `${MENU_URL}?tid=${hallId}&date=${formatDate(date)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`UMass Dining menu request failed: ${res.status}`);

  const text = await res.text();
  if (!text || !text.trim()) return [];

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // UMass Dining returns a blank 200 response for closed/unavailable halls.
    return [];
  }

  const items = [];
  for (const [mealPeriodKey, value] of Object.entries(data)) {
    if (!value) continue;
    items.push(
      ...parseMenuValue(value, {
        hallId,
        hallName: hall?.name ?? `Dining Hall ${hallId}`,
        mealPeriod: normalizeMealPeriod(mealPeriodKey),
      })
    );
  }
  return items;
}

export async function fetchAllHallsMenu(date = new Date()) {
  const results = await Promise.allSettled(DINING_HALLS.map(h => fetchHallMenu(h.id, date)));
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
