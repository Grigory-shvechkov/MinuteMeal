export const DINING_HALLS = [
  { id: 1, name: 'Worcester Commons' },
  { id: 2, name: 'Franklin Dining Commons' },
  { id: 3, name: 'Hampshire Dining Commons' },
  { id: 4, name: 'Berkshire Dining Commons' },
];

export async function fetchHalls() {
  const res = await fetch('/api/halls');
  if (!res.ok) throw new Error('Failed to fetch dining hall statuses');
  return res.json();
}

export async function fetchAllMenu() {
  const res = await fetch('/api/menu');
  if (!res.ok) throw new Error('Failed to fetch menu data');
  return res.json();
}

export async function fetchHallMenu(hallId) {
  const res = await fetch(`/api/menu/${hallId}`);
  if (!res.ok) throw new Error('Failed to fetch menu data');
  return res.json();
}
