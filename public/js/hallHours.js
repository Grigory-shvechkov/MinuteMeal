function parseClockTime(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10) % 12;
  const minutes = parseInt(match[2], 10);
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + minutes;
}

/** Whether a hall is currently open, based on its posted daily open/close hours (viewer's local clock). */
export function isHallOpenNow(hall, now = new Date()) {
  if (hall.open24) return true;

  const openMin = parseClockTime(hall.openingHours);
  const closeMin = parseClockTime(hall.closingHours);
  if (openMin === null || closeMin === null) return true;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (closeMin > openMin) {
    return nowMin >= openMin && nowMin <= closeMin;
  }
  return nowMin >= openMin || nowMin <= closeMin;
}
