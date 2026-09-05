export function filterForPrefs(items, opts) {
  return items.filter(item => {
    if (item.mealPeriod !== opts.mealPeriod) return false;
    if (item.calories <= 0) return false;

    if (
      opts.avoidAllergens.length &&
      opts.avoidAllergens.some(avoided => item.allergens.some(a => a.toLowerCase() === avoided.toLowerCase()))
    ) {
      return false;
    }

    if (opts.dietaryPrefs.length && !opts.dietaryPrefs.every(pref => item.dietTags.includes(pref))) {
      return false;
    }

    return true;
  });
}

/** Higher score = better pick: rewards protein density and overall healthfulness, penalizes blowing the calorie budget. */
export function scoreItem(item, opts) {
  const proteinPerCal = item.calories > 0 ? item.proteinG / item.calories : 0;
  let score = proteinPerCal * 100 + item.healthfulness * 0.5;
  if (item.calories > opts.remainingCalories) score -= 40;
  return score;
}

export function recommendItems(items, opts, count = 5) {
  const eligible = filterForPrefs(items, opts);
  return [...eligible].sort((a, b) => scoreItem(b, opts) - scoreItem(a, opts)).slice(0, count);
}

/** Which food station has the single best-scoring item right now, or null if nothing qualifies. */
export function recommendStation(items, opts) {
  const eligible = filterForPrefs(items, opts);
  if (eligible.length === 0) return null;
  const best = [...eligible].sort((a, b) => scoreItem(b, opts) - scoreItem(a, opts))[0];
  return best.category;
}

/** Greedily builds a small combo of items that fits inside the remaining calorie budget. */
export function recommendCombo(items, opts, maxItems = 4) {
  const eligible = filterForPrefs(items, opts).sort((a, b) => scoreItem(b, opts) - scoreItem(a, opts));
  const combo = [];
  let total = 0;
  for (const item of eligible) {
    if (combo.length >= maxItems) break;
    if (total + item.calories <= opts.remainingCalories + 50) {
      combo.push(item);
      total += item.calories;
    }
  }
  return combo;
}
