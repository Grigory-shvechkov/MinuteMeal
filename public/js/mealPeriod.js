const PERIOD_LABEL = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  latenight: 'Late Night',
};

/**
 * UMass Dining doesn't publish exact per-meal-period clock times anywhere
 * (only whole-day hall hours) — these boundaries are a best-effort estimate,
 * not an authoritative schedule. Combined with isHallOpenNow, which uses each
 * hall's real posted hours, to decide what's actually being served right now.
 */
export function currentMealPeriod(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 10.5) return 'breakfast';
  if (hour < 15.5) return 'lunch';
  if (hour < 20.5) return 'dinner';
  return 'latenight';
}

export function mealPeriodLabel(period) {
  return PERIOD_LABEL[period] ?? period;
}

export const PERIODS = ['breakfast', 'lunch', 'dinner', 'latenight'];
