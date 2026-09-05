const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little to no exercise' },
  { value: 'light', label: 'Light', hint: 'Exercise 1-3 days/week' },
  { value: 'moderate', label: 'Moderate', hint: 'Exercise 3-5 days/week' },
  { value: 'active', label: 'Active', hint: 'Exercise 6-7 days/week' },
  { value: 'very_active', label: 'Very Active', hint: 'Hard training or physical job' },
];

export function isProfileComplete(profile) {
  return (
    profile.age !== null &&
    profile.sex !== null &&
    profile.heightCm !== null &&
    profile.weightKg !== null &&
    profile.activityLevel !== null &&
    profile.goal !== null
  );
}

/** Mifflin-St Jeor equation. Returns null if the profile is incomplete. */
export function calculateBmr(profile) {
  const { age, sex, heightCm, weightKg } = profile;
  if (age === null || sex === null || heightCm === null || weightKg === null) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calculateTdee(profile) {
  const bmr = calculateBmr(profile);
  if (bmr === null || profile.activityLevel === null) return null;
  return bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
}

export function suggestedCalorieGoal(profile) {
  const tdee = calculateTdee(profile);
  if (tdee === null) return null;
  const goal = profile.goal ?? 'maintain';
  const adjusted = goal === 'cut' ? tdee - 500 : goal === 'bulk' ? tdee + 300 : tdee;
  const floor = profile.sex === 'female' ? 1200 : 1500;
  return Math.round(Math.max(adjusted, floor));
}

export function suggestedProteinGoalG(profile) {
  if (profile.weightKg === null) return null;
  const goal = profile.goal ?? 'maintain';
  const factor = goal === 'cut' ? 2.0 : goal === 'bulk' ? 1.8 : 1.6;
  return Math.round(profile.weightKg * factor);
}

export function feetInchesToCm(feet, inches) {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function cmToFeetInches(cm) {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return { feet, inches };
}

export function lbsToKg(lbs) {
  return lbs * 0.453592;
}

export function kgToLbs(kg) {
  return kg / 0.453592;
}
