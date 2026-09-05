import { filterForPrefs, scoreItem } from './recommend.js';

const FOOD_KEYWORDS = [
  'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp', 'tofu', 'pasta', 'pizza', 'salad',
  'soup', 'rice', 'burger', 'sandwich', 'wrap', 'taco', 'burrito', 'sushi', 'noodles', 'waffle',
  'pancake', 'egg', 'omelet', 'bagel', 'fruit', 'yogurt', 'smoothie', 'spicy', 'sweet', 'dessert',
  'cookie', 'cake', 'vegetable', 'veggie', 'grill', 'bbq', 'quesadilla', 'stir fry', 'curry', 'stew',
  'chili', 'steak', 'bacon', 'sausage', 'fries', 'wings',
];

function addAllergen(intent, name) {
  if (!intent.avoidAllergens.includes(name)) intent.avoidAllergens.push(name);
}

function addDietPref(intent, pref) {
  if (!intent.dietaryPrefs.includes(pref)) intent.dietaryPrefs.push(pref);
}

const RULES = [
  {
    test: /\b(cutting|cut|lean|diet(ing)?|lose weight|low[\s-]?cal(orie)?s?)\b/i,
    label: 'Cutting',
    apply: i => {
      i.calorieCap = i.calorieCap ? Math.min(i.calorieCap, 500) : 500;
      i.proteinBoost = true;
    },
  },
  {
    test: /\b(bulk(ing)?|gain(ing)? weight|mass|high[\s-]?cal(orie)?s?)\b/i,
    label: 'Bulking',
    apply: i => {
      i.calorieFloor = i.calorieFloor ? Math.max(i.calorieFloor, 700) : 700;
      i.proteinBoost = true;
    },
  },
  {
    test: /\b(snack|small|light)\b/i,
    label: 'Small / light',
    apply: i => {
      i.calorieCap = i.calorieCap ? Math.min(i.calorieCap, 350) : 350;
    },
  },
  {
    test: /\b(big|huge|starving|very hungry|large)\b/i,
    label: 'Big meal',
    apply: i => {
      i.calorieFloor = i.calorieFloor ? Math.max(i.calorieFloor, 700) : 700;
    },
  },
  { test: /\b(protein|gains|swole|muscle)\b/i, label: 'High protein', apply: i => { i.proteinBoost = true; } },
  { test: /\b(low[\s-]?carb|keto)\b/i, label: 'Low carb', apply: i => { i.lowCarb = true; } },
  { test: /\b(vegetarian|veggie)\b/i, label: 'Vegetarian', apply: i => addDietPref(i, 'Vegetarian') },
  { test: /\bvegan\b/i, label: 'Vegan', apply: i => addDietPref(i, 'Vegan') },
  { test: /\bhalal\b/i, label: 'Halal', apply: i => addDietPref(i, 'Halal') },
  { test: /\b(no dairy|dairy[\s-]?free|no milk)\b/i, label: 'No dairy', apply: i => addAllergen(i, 'Milk') },
  {
    test: /\b(gluten[\s-]?free|no gluten)\b/i,
    label: 'Gluten-free',
    apply: i => {
      addAllergen(i, 'Gluten');
      addAllergen(i, 'Wheat');
    },
  },
  {
    test: /\b(nut[\s-]?free|no nuts)\b/i,
    label: 'Nut-free',
    apply: i => {
      addAllergen(i, 'Tree Nuts');
      addAllergen(i, 'Peanuts');
    },
  },
  { test: /\b(no soy|soy[\s-]?free)\b/i, label: 'Soy-free', apply: i => addAllergen(i, 'Soy') },
  { test: /\b(no egg|egg[\s-]?free)\b/i, label: 'Egg-free', apply: i => addAllergen(i, 'Eggs') },
];

/** Parses free-text like "I'm feeling for a cutting meal, something with chicken" into filter/scoring hints. */
export function parseCraving(text) {
  const intent = {
    raw: text,
    summary: '',
    proteinBoost: false,
    lowCarb: false,
    dietaryPrefs: [],
    avoidAllergens: [],
    keywords: [],
  };

  const labels = [];
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      rule.apply(intent);
      labels.push(rule.label);
    }
  }

  const lower = text.toLowerCase();
  for (const kw of FOOD_KEYWORDS) {
    if (lower.includes(kw)) intent.keywords.push(kw);
  }

  const parts = [...new Set(labels)];
  if (intent.keywords.length) parts.push(intent.keywords.join(', '));
  const trimmed = text.trim();
  intent.summary = parts.length ? parts.join(' · ') : trimmed ? `matching "${trimmed}" to today's menu` : "today's best pick";

  return intent;
}

function scoreCravingItem(item, opts, intent) {
  let score = scoreItem(item, opts);
  if (intent.proteinBoost) score += (item.proteinG / Math.max(item.calories, 1)) * 150;
  if (intent.lowCarb) score -= item.totalCarbG * 1.5;
  if (intent.calorieCap) score -= Math.max(0, item.calories - intent.calorieCap) * 0.5;
  if (intent.calorieFloor) score -= Math.max(0, intent.calorieFloor - item.calories) * 0.3;
  return score;
}

function rankedCravingPool(items, intent, base) {
  const opts = {
    ...base,
    dietaryPrefs: [...new Set([...base.dietaryPrefs, ...intent.dietaryPrefs])],
    avoidAllergens: [...new Set([...base.avoidAllergens, ...intent.avoidAllergens])],
  };

  let pool = filterForPrefs(items, opts);

  if (intent.keywords.length) {
    const matched = pool.filter(item =>
      intent.keywords.some(k => item.name.toLowerCase().includes(k) || item.category.toLowerCase().includes(k))
    );
    if (matched.length > 0) pool = matched;
  }

  if (intent.calorieCap) {
    const capped = pool.filter(i => i.calories <= intent.calorieCap * 1.3);
    if (capped.length > 0) pool = capped;
  }
  if (intent.calorieFloor) {
    const floored = pool.filter(i => i.calories >= intent.calorieFloor * 0.4);
    if (floored.length > 0) pool = floored;
  }

  return [...pool].sort((a, b) => scoreCravingItem(b, opts, intent) - scoreCravingItem(a, opts, intent));
}

export function recommendForCraving(items, intent, base, count = 6) {
  return rankedCravingPool(items, intent, base).slice(0, count);
}

/** Which food station best matches the craving intent right now, or null if nothing qualifies. */
export function recommendStationForCraving(items, intent, base) {
  const pool = rankedCravingPool(items, intent, base);
  return pool.length > 0 ? pool[0].category : null;
}

/** Greedily builds a small combo meal from a craving-ranked pool, filling up to (roughly) the calorie budget. */
export function buildCravingCombo(items, intent, base, maxItems = 4) {
  const pool = rankedCravingPool(items, intent, base);
  const budget = intent.calorieFloor ? Math.max(base.remainingCalories, intent.calorieFloor) : base.remainingCalories;

  const combo = [];
  let total = 0;
  for (const item of pool) {
    if (combo.length >= maxItems) break;
    if (total + item.calories <= budget + 50) {
      combo.push(item);
      total += item.calories;
    }
  }
  return combo;
}
