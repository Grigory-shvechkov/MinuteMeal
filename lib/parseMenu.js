const CATEGORY_HEADER_RE = /<h2 class=['"]menu_category_name['"]>([^<]*)<\/h2>/g;
const ITEM_TAG_RE = /<a\s+([^>]*data-dish-name="[^"]*"[^>]*)>([^<]*)<\/a>/g;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;

/**
 * UMass Dining's menu endpoint returns each meal period's value as an object
 * keyed by category name (e.g. {"Entrees": "<html>", "Soups": "<html>"}),
 * where each value is a raw HTML fragment with per-item nutrition facts
 * embedded as data-* attributes on an <a> tag. This walks that HTML without a
 * DOM parser using targeted regexes.
 *
 * Falls back to splitting on <h2 class='menu_category_name'> headers if a
 * meal period's value ever comes back as a single flat HTML string instead.
 */
export function parseMenuValue(value, ctx) {
  if (!value) return [];

  if (typeof value === 'string') {
    return parseFlatMenuHtml(value, ctx);
  }

  if (typeof value === 'object') {
    const items = [];
    for (const [category, html] of Object.entries(value)) {
      if (typeof html === 'string') {
        items.push(...extractItems(html, decodeEntities(category), ctx));
      }
    }
    return items;
  }

  return [];
}

function parseFlatMenuHtml(html, ctx) {
  const headers = [];
  let headerMatch;
  CATEGORY_HEADER_RE.lastIndex = 0;
  while ((headerMatch = CATEGORY_HEADER_RE.exec(html))) {
    headers.push({
      name: decodeEntities(headerMatch[1].trim()) || 'Menu',
      start: headerMatch.index,
      end: headerMatch.index + headerMatch[0].length,
    });
  }

  if (headers.length === 0) {
    return extractItems(html, 'Menu', ctx);
  }

  const items = [];
  for (let i = 0; i < headers.length; i++) {
    const sectionStart = headers[i].end;
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].start : html.length;
    const section = html.slice(sectionStart, sectionEnd);
    items.push(...extractItems(section, headers[i].name, ctx));
  }
  return items;
}

function extractItems(section, category, ctx) {
  const items = [];
  ITEM_TAG_RE.lastIndex = 0;
  let match;
  let index = 0;
  while ((match = ITEM_TAG_RE.exec(section))) {
    const attrs = parseAttrs(match[1]);
    const name = decodeEntities(attrs['data-dish-name'] || match[2].trim());
    if (!name) continue;

    items.push({
      id: slug(`${ctx.hallId}-${ctx.mealPeriod}-${category}-${name}-${index++}`),
      name,
      category,
      mealPeriod: ctx.mealPeriod,
      hallId: ctx.hallId,
      hallName: ctx.hallName,
      servingSize: attrs['data-serving-size'] || '',
      calories: parseNum(attrs['data-calories']),
      totalFatG: parseNum(attrs['data-total-fat']),
      satFatG: parseNum(attrs['data-sat-fat']),
      transFatG: parseNum(attrs['data-trans-fat']),
      cholesterolMg: parseNum(attrs['data-cholesterol']),
      sodiumMg: parseNum(attrs['data-sodium']),
      totalCarbG: parseNum(attrs['data-total-carb']),
      fiberG: parseNum(attrs['data-dietary-fiber']),
      sugarsG: parseNum(attrs['data-sugars']),
      proteinG: parseNum(attrs['data-protein']),
      allergens: splitList(attrs['data-allergens']),
      dietTags: splitList(attrs['data-clean-diet-str']),
      healthfulness: parseNum(attrs['data-healthfulness']),
    });
  }
  return items;
}

function parseAttrs(tagAttrs) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(tagAttrs))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function parseNum(value) {
  if (!value) return 0;
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slug(value) {
  return value.replace(/\s+/g, '_');
}
