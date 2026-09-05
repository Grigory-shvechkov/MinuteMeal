const SETTINGS_KEY = 'minutemeal:settings:v1';
const DIARY_KEY = 'minutemeal:diary:v1';
const PROFILE_KEY = 'minutemeal:profile:v1';
const ONBOARDING_KEY = 'minutemeal:onboardingSeen:v1';

const DEFAULT_SETTINGS = { dailyCalorieGoal: 2200, proteinGoalG: 120, dietaryPrefs: [], avoidAllergens: [] };
const DEFAULT_PROFILE = {
  age: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
  goal: null,
  unitSystem: 'imperial',
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...parsed } : parsed;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — fail silently, matches mobile app's behavior.
  }
}

export const store = {
  settings: loadJson(SETTINGS_KEY, DEFAULT_SETTINGS),
  profile: loadJson(PROFILE_KEY, DEFAULT_PROFILE),
  diary: loadJson(DIARY_KEY, []),
  onboardingSeen: loadJson(ONBOARDING_KEY, false) === true,

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveJson(SETTINGS_KEY, this.settings);
  },
  updateProfile(patch) {
    this.profile = { ...this.profile, ...patch };
    saveJson(PROFILE_KEY, this.profile);
  },
  completeOnboarding() {
    this.onboardingSeen = true;
    saveJson(ONBOARDING_KEY, true);
  },
  addEntry(item) {
    const entry = { id: `${item.id}-${Date.now()}`, loggedAt: new Date().toISOString(), item };
    this.diary = [entry, ...this.diary];
    saveJson(DIARY_KEY, this.diary);
  },
  addEntries(items) {
    const now = Date.now();
    const entries = items.map((item, i) => ({ id: `${item.id}-${now}-${i}`, loggedAt: new Date().toISOString(), item }));
    this.diary = [...entries, ...this.diary];
    saveJson(DIARY_KEY, this.diary);
  },
  removeEntry(id) {
    this.diary = this.diary.filter(e => e.id !== id);
    saveJson(DIARY_KEY, this.diary);
  },
  todaysDiary() {
    const now = new Date();
    return this.diary.filter(e => new Date(e.loggedAt).toDateString() === now.toDateString());
  },
  caloriesConsumedToday() {
    return this.todaysDiary().reduce((s, e) => s + e.item.calories, 0);
  },
  proteinConsumedToday() {
    return this.todaysDiary().reduce((s, e) => s + e.item.proteinG, 0);
  },
  remainingCalories() {
    return this.settings.dailyCalorieGoal - this.caloriesConsumedToday();
  },
};
