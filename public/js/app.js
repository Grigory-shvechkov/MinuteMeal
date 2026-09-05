import { DINING_HALLS, fetchAllMenu, fetchHallMenu, fetchHalls } from './api.js';
import { buildCravingCombo, parseCraving, recommendForCraving } from './craving.js';
import { isHallOpenNow } from './hallHours.js';
import { currentMealPeriod, mealPeriodLabel, PERIODS } from './mealPeriod.js';
import {
  ACTIVITY_LEVEL_OPTIONS,
  cmToFeetInches,
  feetInchesToCm,
  isProfileComplete,
  kgToLbs,
  lbsToKg,
  suggestedCalorieGoal,
  suggestedProteinGoalG,
} from './nutrition.js';
import { recommendCombo, recommendStations } from './recommend.js';
import { store } from './storage.js';

const appEl = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function macroTile(label, value) {
  return el('div', { class: 'macro-item' }, [
    el('div', { class: 'macro-value' }, value),
    el('div', { class: 'macro-label' }, label),
  ]);
}

function closeModal() {
  modalRoot.innerHTML = '';
}

// ---------- Router ----------

const ROUTE_HANDLERS = { home: renderHome, halls: renderHalls, diary: renderDiary, settings: renderSettings };

function currentRoute() {
  const hash = location.hash.replace('#', '') || 'home';
  const [route, param, extra] = hash.split('/');
  return { route, param, extra: extra ? decodeURIComponent(extra) : null };
}

async function render() {
  document.querySelectorAll('.tray-bar-host').forEach(n => n.remove());

  if (!store.onboardingSeen) {
    document.body.classList.add('onboarding-active');
    renderOnboarding();
    return;
  }
  document.body.classList.remove('onboarding-active');

  const { route, param, extra } = currentRoute();
  document.querySelectorAll('.tabbar button').forEach(b => {
    const active = b.dataset.route === route || (route === 'menu' && b.dataset.route === 'halls');
    b.classList.toggle('active', active);
  });

  appEl.innerHTML = '';
  appEl.appendChild(el('p', { class: 'empty-text' }, 'Loading…'));

  try {
    if (route === 'menu') {
      await renderMenu(parseInt(param, 10), extra);
    } else if (ROUTE_HANDLERS[route]) {
      await ROUTE_HANDLERS[route]();
    } else {
      await renderHome();
    }
  } catch (err) {
    appEl.innerHTML = '';
    appEl.appendChild(el('p', { class: 'error-text' }, `Something went wrong: ${err.message}`));
  }
}

window.addEventListener('hashchange', render);
document.querySelectorAll('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    location.hash = `#${btn.dataset.route}`;
  });
});

function navigateToMenu(hallId, station) {
  location.hash = station ? `#menu/${hallId}/${encodeURIComponent(station)}` : `#menu/${hallId}`;
}

// ---------- Onboarding ----------

function renderOnboarding() {
  appEl.innerHTML = '';
  appEl.appendChild(el('h1', { class: 'page-title' }, 'Welcome to MinuteMeal'));
  appEl.appendChild(
    el(
      'p',
      { class: 'subtitle' },
      'A few details help us suggest a daily calorie & protein target tailored to you. You can change this anytime in Settings.'
    )
  );
  const formHost = el('div', {});
  appEl.appendChild(formHost);

  renderProfileForm(formHost, store.profile, {
    saveLabel: 'Save & Continue',
    showSkip: true,
    onSave: profile => {
      store.updateProfile(profile);
      const calorieGoal = suggestedCalorieGoal(profile);
      const proteinGoal = suggestedProteinGoalG(profile);
      if (calorieGoal !== null && proteinGoal !== null) {
        store.updateSettings({ dailyCalorieGoal: calorieGoal, proteinGoalG: proteinGoal });
      }
      store.completeOnboarding();
      render();
    },
    onSkip: () => {
      store.completeOnboarding();
      render();
    },
  });
}

// ---------- Profile form (shared by onboarding + settings) ----------

function renderProfileForm(host, initialProfile, { saveLabel, showSkip, onSave, onSkip }) {
  const state = { ...initialProfile };
  if (state.heightCm !== null) {
    const { feet, inches } = cmToFeetInches(state.heightCm);
    state._feet = feet;
    state._inches = inches;
    state._cm = state.heightCm;
  } else {
    state._feet = '';
    state._inches = '';
    state._cm = '';
  }
  state._lbs = state.weightKg !== null ? Math.round(kgToLbs(state.weightKg)) : '';
  state._kg = state.weightKg !== null ? state.weightKg : '';

  let saveBtn = null;
  let hintEl = null;

  function refreshSaveState() {
    const canSave = isProfileComplete(buildProfile());
    if (saveBtn) saveBtn.disabled = !canSave;
    if (hintEl) hintEl.hidden = canSave;
  }

  function buildProfile() {
    const heightCm =
      state.unitSystem === 'metric'
        ? parseFloat(state._cm) || null
        : feetInchesToCm(parseInt(state._feet, 10) || 0, parseInt(state._inches, 10) || 0) || null;
    const weightKg = state.unitSystem === 'metric' ? parseFloat(state._kg) || null : lbsToKg(parseFloat(state._lbs) || 0) || null;
    return {
      age: parseInt(state.age, 10) || null,
      sex: state.sex ?? null,
      heightCm,
      weightKg,
      activityLevel: state.activityLevel ?? null,
      goal: state.goal ?? null,
      unitSystem: state.unitSystem,
    };
  }

  function draw() {
    host.innerHTML = '';

    host.appendChild(el('div', { class: 'label-eyebrow' }, 'Units'));
    host.appendChild(
      el('div', { class: 'chip-row' }, [
        el(
          'button',
          {
            class: `chip ${state.unitSystem === 'imperial' ? 'active' : ''}`,
            onclick: () => {
              state.unitSystem = 'imperial';
              draw();
            },
          },
          'Imperial (ft/lb)'
        ),
        el(
          'button',
          {
            class: `chip ${state.unitSystem === 'metric' ? 'active' : ''}`,
            onclick: () => {
              state.unitSystem = 'metric';
              draw();
            },
          },
          'Metric (cm/kg)'
        ),
      ])
    );

    host.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Age'));
    const ageInput = el('input', { type: 'number', placeholder: 'e.g. 20', value: state.age ?? '' });
    ageInput.addEventListener('input', e => {
      state.age = e.target.value;
      refreshSaveState();
    });
    host.appendChild(ageInput);

    const sexLabel = el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Sex (used for the calorie formula)');
    host.appendChild(sexLabel);
    host.appendChild(
      el('div', { class: 'chip-row' }, [
        el(
          'button',
          {
            class: `chip ${state.sex === 'male' ? 'active' : ''}`,
            onclick: () => {
              state.sex = 'male';
              draw();
            },
          },
          'Male'
        ),
        el(
          'button',
          {
            class: `chip ${state.sex === 'female' ? 'active' : ''}`,
            onclick: () => {
              state.sex = 'female';
              draw();
            },
          },
          'Female'
        ),
      ])
    );

    host.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Height'));
    if (state.unitSystem === 'metric') {
      const cmInput = el('input', { type: 'number', placeholder: 'cm', value: state._cm });
      cmInput.addEventListener('input', e => {
        state._cm = e.target.value;
        refreshSaveState();
      });
      host.appendChild(cmInput);
    } else {
      const feetInput = el('input', { type: 'number', placeholder: 'ft', value: state._feet });
      feetInput.addEventListener('input', e => {
        state._feet = e.target.value;
        refreshSaveState();
      });
      const inchesInput = el('input', { type: 'number', placeholder: 'in', value: state._inches });
      inchesInput.addEventListener('input', e => {
        state._inches = e.target.value;
        refreshSaveState();
      });
      host.appendChild(el('div', { class: 'two-col' }, [feetInput, inchesInput]));
    }

    host.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Weight'));
    const weightInput = el('input', {
      type: 'number',
      placeholder: state.unitSystem === 'metric' ? 'kg' : 'lb',
      value: state.unitSystem === 'metric' ? state._kg : state._lbs,
    });
    weightInput.addEventListener('input', e => {
      if (state.unitSystem === 'metric') state._kg = e.target.value;
      else state._lbs = e.target.value;
      refreshSaveState();
    });
    host.appendChild(weightInput);

    host.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Activity level'));
    const activityHost = el('div', {});
    ACTIVITY_LEVEL_OPTIONS.forEach(opt => {
      activityHost.appendChild(
        el(
          'div',
          {
            class: `option-row ${state.activityLevel === opt.value ? 'active' : ''}`,
            onclick: () => {
              state.activityLevel = opt.value;
              draw();
            },
          },
          [el('div', { class: 'option-label' }, opt.label), el('div', { class: 'option-hint' }, opt.hint)]
        )
      );
    });
    host.appendChild(activityHost);

    host.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Goal'));
    host.appendChild(
      el(
        'div',
        { class: 'chip-row' },
        [
          ['cut', 'Cut'],
          ['maintain', 'Maintain'],
          ['bulk', 'Bulk'],
        ].map(([value, label]) =>
          el(
            'button',
            {
              class: `chip ${state.goal === value ? 'active' : ''}`,
              onclick: () => {
                state.goal = value;
                draw();
              },
            },
            label
          )
        )
      )
    );

    const canSave = isProfileComplete(buildProfile());
    saveBtn = el(
      'button',
      {
        class: 'btn btn-primary',
        style: 'margin-top:20px',
        disabled: canSave ? null : 'disabled',
        onclick: () => onSave(buildProfile()),
      },
      saveLabel
    );
    host.appendChild(saveBtn);
    hintEl = el('p', { class: 'hint', style: 'text-align:center' }, 'Fill in every field to get a personalized calorie & protein target.');
    hintEl.hidden = canSave;
    host.appendChild(hintEl);
    if (showSkip) {
      host.appendChild(
        el(
          'button',
          { class: 'btn btn-secondary', style: 'width:100%;margin-top:8px', onclick: onSkip },
          'Skip for now'
        )
      );
    }
  }

  draw();
}

// ---------- Home ----------

async function renderHome() {
  appEl.innerHTML = '';
  const mealPeriod = currentMealPeriod();

  appEl.appendChild(el('h1', { class: 'page-title' }, 'MinuteMeal'));
  appEl.appendChild(el('p', { class: 'subtitle' }, `AI-built meals for ${mealPeriodLabel(mealPeriod)} at UMass`));

  const goalCard = el('div', { class: 'card' });
  appEl.appendChild(goalCard);

  const cravingCard = el('div', { class: 'card' });
  const buildHallCard = el('div', { class: 'card' }, [
    el('div', { class: 'label-eyebrow' }, 'Or browse a hall yourself'),
    el('p', { class: 'hint', style: 'margin-top:0' }, 'Pick a dining hall to put together a combo from its food stations.'),
    el(
      'div',
      { class: 'chip-row' },
      DINING_HALLS.map(hall =>
        el(
          'button',
          { class: 'chip', onclick: () => navigateToMenu(hall.id) },
          hall.name.replace(' Dining Commons', '').replace(' Commons', '')
        )
      )
    ),
  ]);
  appEl.appendChild(cravingCard);
  appEl.appendChild(buildHallCard);

  const statusHost = el('div', {});
  appEl.appendChild(statusHost);

  function drawGoalCard() {
    const consumed = store.caloriesConsumedToday();
    const remaining = store.remainingCalories();
    const pct = Math.max(0, Math.min(100, Math.round((consumed / store.settings.dailyCalorieGoal) * 100)));
    goalCard.innerHTML = '';
    goalCard.appendChild(el('div', { class: 'label-eyebrow' }, 'Today'));
    goalCard.appendChild(el('div', { class: 'goal-value' }, `${consumed} / ${store.settings.dailyCalorieGoal} cal`));
    goalCard.appendChild(
      el('div', { class: 'progress-track' }, [el('div', { class: 'progress-fill', style: `width:${pct}%` })])
    );
    goalCard.appendChild(
      el('div', { class: 'goal-hint' }, remaining > 0 ? `${remaining} cal left today` : 'Over your goal today')
    );
  }
  drawGoalCard();

  let menu = [];
  let hallStatuses = [];
  try {
    [menu, hallStatuses] = await Promise.all([fetchAllMenu(), fetchHalls()]);
  } catch (err) {
    statusHost.appendChild(el('p', { class: 'error-text' }, 'Live menu unavailable right now. Reload to try again.'));
  }

  const openHallIds = new Set(hallStatuses.filter(h => isHallOpenNow(h)).map(h => h.id));
  const allClosed = hallStatuses.length > 0 && openHallIds.size === 0;
  const menuFromOpenHalls = hallStatuses.length > 0 ? menu.filter(i => openHallIds.has(i.hallId)) : menu;

  if (allClosed) {
    statusHost.appendChild(el('p', { class: 'empty-text' }, 'All dining halls are currently closed.'));
  }

  let stationFilter = null;
  const availableStations = [...new Set(menuFromOpenHalls.filter(i => i.mealPeriod === mealPeriod).map(i => i.category))].sort();

  function drawCravingCard() {
    cravingCard.innerHTML = '';
    cravingCard.appendChild(el('div', { class: 'label-eyebrow' }, 'What are you feeling?'));
    const textInput = el('input', {
      type: 'text',
      placeholder: 'e.g. "cutting meal, high protein" or "craving something spicy" (or leave blank)',
    });
    textInput.value = cravingCard._text || '';
    textInput.addEventListener('input', e => {
      cravingCard._text = e.target.value;
    });
    textInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') buildMeal();
    });
    cravingCard.appendChild(textInput);
    cravingCard.appendChild(el('p', { class: 'hint' }, 'Tip: use your device’s voice-to-text/dictation to speak instead of typing.'));

    if (availableStations.length > 0) {
      cravingCard.appendChild(el('div', { class: 'label-eyebrow' }, 'Only from a station (optional)'));
      const row = el('div', { class: 'chip-row scroll' }, [
        el(
          'button',
          {
            class: `chip ${!stationFilter ? 'active' : ''}`,
            onclick: () => {
              stationFilter = null;
              drawCravingCard();
            },
          },
          'Any station'
        ),
        ...availableStations.map(station =>
          el(
            'button',
            {
              class: `chip ${stationFilter === station ? 'active' : ''}`,
              onclick: () => {
                stationFilter = station;
                drawCravingCard();
              },
            },
            station
          )
        ),
      ]);
      cravingCard.appendChild(row);
    }

    cravingCard.appendChild(
      el('button', { class: 'btn btn-primary', style: 'margin-top:10px', onclick: buildMeal }, '✨ Build My Meal')
    );
  }

  function buildMeal() {
    const text = cravingCard._text || '';
    const intent = parseCraving(text.trim());
    const candidateItems = stationFilter ? menuFromOpenHalls.filter(i => i.category === stationFilter) : menuFromOpenHalls;
    const baseOpts = {
      remainingCalories: Math.max(store.remainingCalories(), 200),
      mealPeriod,
      dietaryPrefs: store.settings.dietaryPrefs,
      avoidAllergens: store.settings.avoidAllergens,
    };

    // A meal has to come from one dining hall you can actually visit — find
    // whichever hall has the single best match across everything open, then
    // build the whole combo from just that hall's items.
    const topPick = recommendForCraving(candidateItems, intent, baseOpts, 1)[0];
    if (!topPick) {
      alert(
        stationFilter
          ? `Couldn't find anything at the ${stationFilter} station right now that fits your goals and preferences.`
          : "Couldn't find anything open right now that fits your goals and preferences."
      );
      return;
    }
    const hallItems = candidateItems.filter(i => i.hallId === topPick.hallId);
    const combo = buildCravingCombo(hallItems, intent, baseOpts, 4);
    if (combo.length === 0) {
      alert("Couldn't fit anything at that hall within your remaining calories — try adjusting your goal or craving text.");
      return;
    }

    openComboModal({
      title: 'Your AI-Built Meal',
      subtitle: `${intent.summary} · ${topPick.hallName}`,
      items: combo,
      showHallBadge: false,
      onLogged: drawGoalCard,
    });
  }

  drawCravingCard();
}

// ---------- Dining Halls list ----------

async function renderHalls() {
  appEl.innerHTML = '';
  appEl.appendChild(el('h1', { class: 'page-title' }, 'Dining Halls'));

  const listHost = el('div', {});
  appEl.appendChild(listHost);
  listHost.appendChild(el('p', { class: 'empty-text' }, 'Loading…'));

  try {
    const halls = await fetchHalls();
    listHost.innerHTML = '';
    halls.forEach(hall => {
      const open = isHallOpenNow(hall);
      listHost.appendChild(
        el('div', { class: 'hall-item', onclick: () => navigateToMenu(hall.id) }, [
          el('div', { class: 'hall-name' }, hall.name),
          el('div', { class: 'hall-hours' }, hall.open24 ? 'Open 24 hours' : `${hall.openingHours} – ${hall.closingHours}`),
          el('div', { class: `status-badge ${open ? 'status-open' : 'status-closed'}` }, open ? 'Open now' : 'Closed now'),
        ])
      );
    });
  } catch (err) {
    listHost.innerHTML = '';
    listHost.appendChild(el('p', { class: 'error-text' }, 'Could not load dining halls right now.'));
  }
}

// ---------- Menu (per hall) ----------

async function renderMenu(hallId, initialStation = null) {
  const hall = DINING_HALLS.find(h => h.id === hallId);
  appEl.innerHTML = '';
  appEl.appendChild(
    el('button', { class: 'btn-danger-text', style: 'color:var(--maroon);margin-top:8px', onclick: () => (location.hash = '#halls') }, '‹ Dining Halls')
  );
  appEl.appendChild(el('h1', { class: 'page-title' }, hall ? hall.name : 'Menu'));

  const tabsHost = el('div', { class: 'tabs-row' });
  const stationHost = el('div', { class: 'chip-row scroll', style: 'margin-top:8px' });
  const recommendStationHost = el('div', { style: 'margin-top:8px' });
  const autoBuildHost = el('div', { style: 'margin-top:10px' });
  const hintHost = el(
    'p',
    { class: 'hint' },
    'Pick a food station to narrow things down, tap the circle to add an item yourself, tap the row for nutrition info, or let auto-build pick a combo for you.'
  );
  const listHost = el('div', {});

  appEl.appendChild(tabsHost);
  appEl.appendChild(stationHost);
  appEl.appendChild(recommendStationHost);
  appEl.appendChild(autoBuildHost);
  appEl.appendChild(hintHost);
  appEl.appendChild(listHost);
  listHost.appendChild(el('p', { class: 'empty-text' }, 'Loading…'));

  let items = [];
  try {
    items = await fetchHallMenu(hallId);
  } catch (err) {
    listHost.innerHTML = '';
    listHost.appendChild(el('p', { class: 'error-text' }, 'Could not load this menu right now.'));
    return;
  }

  const availablePeriodsSet = new Set(items.map(i => i.mealPeriod));
  const availablePeriods = PERIODS.filter(p => availablePeriodsSet.has(p));
  // Default to whatever meal period matches the current time of day, not just
  // whichever period happens to come first — a hall's "breakfast" bucket can
  // be nearly empty on weekends (real brunch items get filed under "lunch"
  // instead), so picking the first available period isn't a reliable default.
  const preferredPeriod = currentMealPeriod();
  let period = availablePeriodsSet.has(preferredPeriod) ? preferredPeriod : availablePeriods.length ? availablePeriods[0] : 'lunch';
  const initialStationValid =
    initialStation && new Set(items.filter(i => i.mealPeriod === period).map(i => i.category)).has(initialStation);
  let stationFilter = initialStationValid ? initialStation : null;
  let stationRecommendIndex = 0;
  let mealTray = [];

  function drawTabs() {
    tabsHost.innerHTML = '';
    (availablePeriods.length ? availablePeriods : PERIODS).forEach(p => {
      tabsHost.appendChild(
        el(
          'button',
          {
            class: `tab-pill ${p === period ? 'active' : ''}`,
            onclick: () => {
              period = p;
              stationFilter = null;
              stationRecommendIndex = 0;
              mealTray = [];
              drawAll();
            },
          },
          mealPeriodLabel(p)
        )
      );
    });
  }

  function availableStations() {
    return [...new Set(items.filter(i => i.mealPeriod === period).map(i => i.category))].sort();
  }

  function drawStations() {
    stationHost.innerHTML = '';
    const stations = availableStations();
    if (stations.length === 0) return;
    stationHost.appendChild(
      el(
        'button',
        {
          class: `chip ${!stationFilter ? 'active' : ''}`,
          onclick: () => {
            stationFilter = null;
            stationRecommendIndex = 0;
            drawAll();
          },
        },
        'All Stations'
      )
    );
    stations.forEach(station => {
      stationHost.appendChild(
        el(
          'button',
          {
            class: `chip ${stationFilter === station ? 'active' : ''}`,
            onclick: () => {
              stationFilter = station;
              drawAll();
            },
          },
          station
        )
      );
    });
  }

  function drawRecommendStationButton() {
    recommendStationHost.innerHTML = '';
    if (availableStations().length === 0) return;
    if (stationFilter) {
      recommendStationHost.appendChild(
        el(
          'button',
          {
            class: 'btn btn-secondary',
            style: 'margin-right:8px',
            onclick: () => {
              stationFilter = null;
              stationRecommendIndex = 0;
              drawAll();
            },
          },
          '‹ Back to All Stations'
        )
      );
    }
    recommendStationHost.appendChild(
      el('button', { class: 'btn btn-primary', onclick: recommendStationHandler }, '🔍 Recommend a Station')
    );
  }

  function recommendStationHandler() {
    const periodItems = items.filter(i => i.mealPeriod === period);
    const recommended = recommendStations(periodItems, {
      remainingCalories: Math.max(store.remainingCalories(), 200),
      mealPeriod: period,
      dietaryPrefs: store.settings.dietaryPrefs,
      avoidAllergens: store.settings.avoidAllergens,
    }, 10);
    if (recommended.length === 0) {
      alert("Couldn't find a station that fits your goals and preferences for this meal period.");
      return;
    }
    stationFilter = recommended[stationRecommendIndex % recommended.length];
    stationRecommendIndex++;
    drawAll();
  }

  function drawAutoBuild() {
    autoBuildHost.innerHTML = '';
    autoBuildHost.appendChild(
      el(
        'button',
        { class: 'btn btn-primary', onclick: autoBuildMeal },
        `✨ Auto-Build ${stationFilter ? `from ${stationFilter}` : 'a Meal'}`
      )
    );
  }

  function autoBuildMeal() {
    const periodItems = items.filter(i => i.mealPeriod === period && (!stationFilter || i.category === stationFilter));
    const combo = recommendCombo(periodItems, {
      remainingCalories: Math.max(store.remainingCalories(), 200),
      mealPeriod: period,
      dietaryPrefs: store.settings.dietaryPrefs,
      avoidAllergens: store.settings.avoidAllergens,
    });
    if (combo.length === 0) {
      alert(
        stationFilter
          ? `Couldn't find items at the ${stationFilter} station that fit your goals and preferences.`
          : "Couldn't find items here that fit your goals and preferences for this meal period."
      );
      return;
    }
    openComboModal({
      title: 'Your Auto-Built Meal',
      subtitle: hall ? hall.name : '',
      items: combo,
      showHallBadge: false,
      onLogged: () => {},
    });
  }

  function isInTray(item) {
    return mealTray.some(i => i.id === item.id);
  }

  function toggleTray(item) {
    mealTray = isInTray(item) ? mealTray.filter(i => i.id !== item.id) : [...mealTray, item];
    drawList();
    drawTrayBar();
  }

  function drawList() {
    listHost.innerHTML = '';
    const filtered = items.filter(i => i.mealPeriod === period && (!stationFilter || i.category === stationFilter));
    if (filtered.length === 0) {
      listHost.appendChild(el('p', { class: 'empty-text' }, 'No menu posted for this meal period.'));
      return;
    }
    const byCategory = new Map();
    for (const item of filtered) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category).push(item);
    }
    for (const [category, categoryItems] of byCategory.entries()) {
      listHost.appendChild(el('div', { class: 'section-header' }, category));
      categoryItems.forEach(item => {
        const picked = isInTray(item);
        const checkbox = el('div', { class: `checkbox ${picked ? 'checked' : ''}`, onclick: e => { e.stopPropagation(); toggleTray(item); } }, picked ? '✓' : '');
        const info = el('div', { class: 'item-info', onclick: () => openItemDetailModal(item, { isInTray, toggleTray, drawList, drawTrayBar }) }, [
          el('div', { class: 'item-name' }, item.name),
          el('div', { class: 'item-meta' }, `${item.calories} cal · ${item.proteinG}g protein`),
        ]);
        listHost.appendChild(el('div', { class: `item-row ${picked ? 'picked' : ''}` }, [checkbox, info, el('div', { class: 'chevron' }, '›')]));
      });
    }
  }

  const trayBarHost = el('div', { class: 'tray-bar-host' });
  document.body.appendChild(trayBarHost);

  function drawTrayBar() {
    trayBarHost.innerHTML = '';
    if (mealTray.length === 0) return;
    const cal = mealTray.reduce((s, i) => s + i.calories, 0);
    const protein = mealTray.reduce((s, i) => s + i.proteinG, 0);
    // Measure the real tab bar height rather than guessing a fixed offset —
    // a mismatch there was covering the tab bar entirely on some devices.
    const tabbarEl = document.querySelector('.tabbar');
    const bottomOffset = tabbarEl ? `${tabbarEl.offsetHeight}px` : 'calc(56px + env(safe-area-inset-bottom, 0px))';
    trayBarHost.appendChild(
      el('div', { class: 'tray-bar', style: `bottom:${bottomOffset}` }, [
        el('div', { class: 'tray-info' }, [
          el('div', { class: 'tray-title' }, `${mealTray.length} item${mealTray.length === 1 ? '' : 's'} selected`),
          el('div', { class: 'tray-meta' }, `${cal} cal · ${Math.round(protein)}g protein`),
        ]),
        el('button', { class: 'btn btn-secondary', onclick: () => { mealTray = []; drawList(); drawTrayBar(); } }, 'Clear'),
        el('button', { class: 'btn btn-primary', style: 'width:auto', onclick: () => {
          const count = mealTray.length;
          store.addEntries(mealTray);
          mealTray = [];
          drawList();
          drawTrayBar();
          alert(`Added ${count} item${count === 1 ? '' : 's'} to your diary as one meal.`);
        } }, 'Log Meal'),
      ])
    );
  }

  function drawAll() {
    drawTabs();
    drawStations();
    drawRecommendStationButton();
    drawAutoBuild();
    drawList();
    drawTrayBar();
  }

  drawAll();
}

function openItemDetailModal(item, { isInTray, toggleTray, drawList, drawTrayBar }) {
  modalRoot.innerHTML = '';
  const sheet = el('div', { class: 'modal-sheet' }, [
    el('div', { class: 'modal-title' }, item.name),
    el('div', { class: 'modal-subtitle' }, item.servingSize || 'Serving size not listed'),
    el('div', { class: 'macro-grid' }, [
      macroTile('Calories', `${item.calories}`),
      macroTile('Protein', `${item.proteinG}g`),
      macroTile('Carbs', `${item.totalCarbG}g`),
      macroTile('Fat', `${item.totalFatG}g`),
      macroTile('Fiber', `${item.fiberG}g`),
      macroTile('Sugars', `${item.sugarsG}g`),
      macroTile('Sodium', `${item.sodiumMg}mg`),
      macroTile('Cholesterol', `${item.cholesterolMg}mg`),
    ]),
  ]);
  if (item.dietTags.length) sheet.appendChild(el('div', { class: 'tag-line' }, `Diet: ${esc(item.dietTags.join(', '))}`));
  if (item.allergens.length) sheet.appendChild(el('div', { class: 'tag-line' }, `Allergens: ${esc(item.allergens.join(', '))}`));

  sheet.appendChild(
    el(
      'button',
      {
        class: 'btn btn-primary',
        style: 'margin-top:18px',
        onclick: () => {
          toggleTray(item);
          drawList();
          drawTrayBar();
          closeModal();
        },
      },
      isInTray(item) ? 'Remove from Meal' : 'Add to Meal'
    )
  );
  sheet.appendChild(
    el(
      'button',
      {
        class: 'btn btn-secondary',
        style: 'width:100%;margin-top:8px',
        onclick: () => {
          store.addEntry(item);
          closeModal();
          alert('Logged that item to your diary.');
        },
      },
      'Log Just This Item'
    )
  );
  sheet.appendChild(el('button', { class: 'btn-secondary', style: 'width:100%;margin-top:8px;background:none;border:none', onclick: closeModal }, 'Close'));

  modalRoot.appendChild(el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === e.currentTarget) closeModal(); } }, [sheet]));
}

function openComboModal({ title, subtitle, items, showHallBadge, onLogged }) {
  let combo = [...items];

  function totals() {
    return {
      cal: combo.reduce((s, i) => s + i.calories, 0),
      protein: combo.reduce((s, i) => s + i.proteinG, 0),
      carbs: combo.reduce((s, i) => s + i.totalCarbG, 0),
      fat: combo.reduce((s, i) => s + i.totalFatG, 0),
    };
  }

  function draw() {
    modalRoot.innerHTML = '';
    const t = totals();
    const body = el('div', { class: 'modal-fullpage-body' });
    const listHost = el('div', {});
    body.appendChild(
      el('div', { class: 'macro-grid' }, [
        macroTile('Calories', `${t.cal}`),
        macroTile('Protein', `${Math.round(t.protein)}g`),
        macroTile('Carbs', `${Math.round(t.carbs)}g`),
        macroTile('Fat', `${Math.round(t.fat)}g`),
      ])
    );
    body.appendChild(listHost);

    if (combo.length === 0) {
      listHost.appendChild(el('p', { class: 'empty-text' }, 'Nothing left — everything was removed.'));
    } else {
      combo.forEach(item => {
        const info = [
          showHallBadge ? el('div', { class: 'hall-badge' }, item.hallName) : null,
          el('div', { class: 'item-name' }, item.name),
          el('div', { class: 'item-meta' }, `${item.category} · ${item.calories} cal · ${item.proteinG}g protein`),
        ];
        listHost.appendChild(
          el('div', { class: 'item-row', style: 'cursor:default' }, [
            el('div', { class: 'item-info' }, info),
            el(
              'button',
              {
                class: 'btn-danger-text',
                onclick: () => {
                  combo = combo.filter(i => i.id !== item.id);
                  draw();
                },
              },
              'Remove'
            ),
          ])
        );
      });
    }

    const footer = el('div', { class: 'modal-fullpage-footer' }, [
      el(
        'button',
        {
          class: 'btn btn-secondary',
          onclick: () => {
            combo = [];
            closeModal();
          },
        },
        'Discard'
      ),
      el(
        'button',
        {
          class: 'btn btn-primary',
          style: 'flex:1',
          disabled: combo.length === 0 ? 'disabled' : null,
          onclick: () => {
            const count = combo.length;
            store.addEntries(combo);
            closeModal();
            onLogged();
            alert(`Added ${count} item${count === 1 ? '' : 's'} to your diary as one meal.`);
          },
        },
        'Log This Meal'
      ),
    ]);

    const sheet = el('div', { class: 'modal-sheet fullpage' }, [
      el('div', { class: 'modal-fullpage-header' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, [
          el('div', {}, [
            el('div', { class: 'modal-title' }, title),
            el('div', { class: 'modal-subtitle' }, subtitle || ''),
          ]),
          el('button', { class: 'btn-danger-text', style: 'color:var(--maroon);white-space:nowrap', onclick: closeModal }, '‹ Back'),
        ]),
      ]),
      body,
      footer,
    ]);
    modalRoot.appendChild(el('div', { class: 'modal-backdrop', style: 'align-items:stretch' }, [sheet]));
  }

  draw();
}

// ---------- Diary ----------

function renderDiary() {
  appEl.innerHTML = '';
  appEl.appendChild(el('h1', { class: 'page-title' }, "Today's Diary"));

  const todays = store.todaysDiary();
  const cal = store.caloriesConsumedToday();
  const protein = store.proteinConsumedToday();
  const carbs = todays.reduce((s, e) => s + e.item.totalCarbG, 0);
  const fat = todays.reduce((s, e) => s + e.item.totalFatG, 0);

  appEl.appendChild(
    el('div', { class: 'macro-grid' }, [
      macroTile('Calories', `${cal}`),
      macroTile('Protein', `${Math.round(protein)}g`),
      macroTile('Carbs', `${Math.round(carbs)}g`),
      macroTile('Fat', `${Math.round(fat)}g`),
    ])
  );

  if (todays.length === 0) {
    appEl.appendChild(el('p', { class: 'empty-text' }, 'Nothing logged yet today. Log a meal from Home or a Dining Hall menu.'));
    return;
  }

  todays.forEach(entry => {
    appEl.appendChild(
      el('div', { class: 'item-row', style: 'cursor:default' }, [
        el('div', { class: 'item-info' }, [
          el('div', { class: 'item-name' }, entry.item.name),
          el('div', { class: 'item-meta' }, `${entry.item.hallName} · ${entry.item.calories} cal · ${entry.item.proteinG}g protein`),
        ]),
        el(
          'button',
          {
            class: 'btn-danger-text',
            onclick: () => {
              store.removeEntry(entry.id);
              renderDiary();
            },
          },
          'Remove'
        ),
      ])
    );
  });
}

// ---------- Settings ----------

function profileSummaryText(profile) {
  if (!isProfileComplete(profile)) return 'Not set up yet';
  const { feet, inches } = cmToFeetInches(profile.heightCm);
  const activityLabel = ACTIVITY_LEVEL_OPTIONS.find(o => o.value === profile.activityLevel)?.label ?? '';
  const goalLabel = profile.goal === 'cut' ? 'Cutting' : profile.goal === 'bulk' ? 'Bulking' : 'Maintaining';
  const sexLabel = profile.sex === 'male' ? 'Male' : 'Female';
  return `${profile.age} yr · ${sexLabel} · ${feet}'${inches}" · ${Math.round(kgToLbs(profile.weightKg))} lb · ${activityLabel} · ${goalLabel}`;
}

const DIET_OPTIONS = ['Vegetarian', 'Vegan', 'Halal', 'Local'];
const ALLERGEN_OPTIONS = ['Milk', 'Eggs', 'Gluten', 'Wheat', 'Soy', 'Peanuts', 'Tree Nuts', 'Fish', 'Shellfish', 'Sesame'];

function renderSettings() {
  appEl.innerHTML = '';
  appEl.appendChild(el('h1', { class: 'page-title' }, 'Settings'));

  const profileCard = el('div', { class: 'card' });
  appEl.appendChild(profileCard);

  function drawProfileCard() {
    profileCard.innerHTML = '';
    profileCard.appendChild(el('div', { class: 'label-eyebrow' }, 'Your profile'));
    profileCard.appendChild(el('div', { class: 'profile-summary' }, profileSummaryText(store.profile)));
    profileCard.appendChild(
      el(
        'button',
        { class: 'btn btn-primary', onclick: openProfileModal },
        isProfileComplete(store.profile) ? 'Edit Profile' : 'Set Up Profile'
      )
    );
  }
  drawProfileCard();

  function openProfileModal() {
    modalRoot.innerHTML = '';
    const sheet = el('div', { class: 'modal-sheet fullpage' });
    const header = el('div', { class: 'modal-fullpage-header' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('div', { class: 'modal-title' }, 'Your Profile'),
        el('button', { class: 'btn-danger-text', style: 'color:var(--maroon)', onclick: closeModal }, 'Close'),
      ]),
    ]);
    const body = el('div', { class: 'modal-fullpage-body' });
    sheet.appendChild(header);
    sheet.appendChild(body);
    modalRoot.appendChild(el('div', { class: 'modal-backdrop', style: 'align-items:stretch' }, [sheet]));

    renderProfileForm(body, store.profile, {
      saveLabel: 'Save Profile',
      showSkip: false,
      onSave: profile => {
        store.updateProfile(profile);
        closeModal();
        drawProfileCard();

        const calorieGoal = suggestedCalorieGoal(profile);
        const proteinGoal = suggestedProteinGoalG(profile);
        if (calorieGoal === null || proteinGoal === null) return;
        const apply = confirm(
          `Based on your profile, MinuteMeal suggests ${calorieGoal} cal and ${proteinGoal}g protein per day. Apply these? (Cancel keeps your current goals.)`
        );
        if (apply) {
          store.updateSettings({ dailyCalorieGoal: calorieGoal, proteinGoalG: proteinGoal });
          drawGoalsCard();
        }
      },
    });
  }

  const goalsCard = el('div', { class: 'card' });
  appEl.appendChild(goalsCard);

  function drawGoalsCard() {
    goalsCard.innerHTML = '';
    goalsCard.appendChild(el('div', { class: 'label-eyebrow' }, 'Daily calorie goal'));
    const calInput = el('input', { type: 'number', value: store.settings.dailyCalorieGoal });
    calInput.addEventListener('change', e => store.updateSettings({ dailyCalorieGoal: parseInt(e.target.value, 10) || 2200 }));
    goalsCard.appendChild(calInput);

    goalsCard.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Daily protein goal (g)'));
    const proteinInput = el('input', { type: 'number', value: store.settings.proteinGoalG });
    proteinInput.addEventListener('change', e => store.updateSettings({ proteinGoalG: parseInt(e.target.value, 10) || 120 }));
    goalsCard.appendChild(proteinInput);
  }
  drawGoalsCard();

  const dietCard = el('div', { class: 'card' });
  appEl.appendChild(dietCard);

  function drawDietCard() {
    dietCard.innerHTML = '';
    dietCard.appendChild(el('div', { class: 'label-eyebrow' }, 'Dietary preferences'));
    dietCard.appendChild(
      el(
        'div',
        { class: 'chip-row' },
        DIET_OPTIONS.map(opt => {
          const active = store.settings.dietaryPrefs.includes(opt);
          return el(
            'button',
            {
              class: `chip ${active ? 'active' : ''}`,
              onclick: () => {
                const next = active ? store.settings.dietaryPrefs.filter(p => p !== opt) : [...store.settings.dietaryPrefs, opt];
                store.updateSettings({ dietaryPrefs: next });
                drawDietCard();
              },
            },
            opt
          );
        })
      )
    );

    dietCard.appendChild(el('div', { class: 'label-eyebrow', style: 'margin-top:16px' }, 'Avoid allergens'));
    dietCard.appendChild(
      el(
        'div',
        { class: 'chip-row' },
        ALLERGEN_OPTIONS.map(opt => {
          const active = store.settings.avoidAllergens.includes(opt);
          return el(
            'button',
            {
              class: `chip ${active ? 'active' : ''}`,
              onclick: () => {
                const next = active ? store.settings.avoidAllergens.filter(p => p !== opt) : [...store.settings.avoidAllergens, opt];
                store.updateSettings({ avoidAllergens: next });
                drawDietCard();
              },
            },
            opt
          );
        })
      )
    );
  }
  drawDietCard();

  appEl.appendChild(
    el(
      'p',
      { class: 'disclaimer' },
      'MinuteMeal is an independent project and is not affiliated with or endorsed by UMass Dining. Menu and nutrition data are pulled from UMass Dining’s public website and may be delayed, incomplete, or occasionally wrong — always check posted signage for allergen information. Calorie/protein targets are a standard estimate (Mifflin-St Jeor), not medical advice. Your diary, profile, and settings are stored only in this browser—they are not synced across devices.'
    )
  );
}

// ---------- Init ----------

render();
