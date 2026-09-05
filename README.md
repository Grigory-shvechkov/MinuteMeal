# MinuteMeal Web

A plain website version of MinuteMeal — an AI-ish meal recommender and calorie
tracker for UMass Amherst dining commons. Built so it can be hosted anywhere
(Render, etc.) and visited from any device's browser, with no app install,
Expo Go, or Apple Developer account required.

## Why this exists

The React Native / Expo version of MinuteMeal (the sibling `MinuteMeal`
project) needs Expo Go or a paid Apple Developer account to run persistently
on an iPhone. This web version sidesteps that entirely — it's just a website.

## Architecture

- **`server.js`** — a small Express server that does two things:
  1. Serves the static frontend from `public/`
  2. Proxies UMass Dining's API server-side (`lib/umassDining.js`,
     `lib/parseMenu.js` — ported from the mobile app's data layer). This proxy
     step is required: UMass Dining's endpoints don't send CORS headers, so a
     browser calling them directly would be blocked. Server-to-server requests
     aren't subject to CORS, so the browser talks to *our* server instead.
- **`public/`** — a plain HTML/CSS/vanilla-JS single-page app. No build step,
  no framework — just ES modules loaded directly by the browser. The
  recommendation/craving engine and nutrition math (`public/js/recommend.js`,
  `craving.js`, `nutrition.js`, `hallHours.js`, `mealPeriod.js`) are ported
  1:1 from the mobile app's TypeScript utilities.
- **Persistence**: settings, profile, and diary are saved in the browser's
  `localStorage` — per-device, no account, no backend database.

## Running locally

```
npm install
npm start
```

Then open `http://localhost:3000`. Since it binds to all interfaces, it's
also reachable from other devices on the same Wi-Fi at
`http://<your-computer's-LAN-IP>:3000`.

## Deploying to Render

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Render sets `PORT` automatically — `server.js` already reads
   `process.env.PORT`, so no config needed there.

No environment variables are required — this proxies public UMass Dining
endpoints with no API keys involved.

## Notes / disclaimers

- Not affiliated with or endorsed by UMass Dining. This scrapes their public,
  unofficial endpoints; expect it to occasionally break if they redesign
  their site (see the `MinuteMeal` mobile project's README for more on this).
- Calorie/protein targets are a standard estimate (Mifflin-St Jeor), not
  medical advice.
- Nothing here is synced across devices or browsers — each browser's
  `localStorage` is independent.
