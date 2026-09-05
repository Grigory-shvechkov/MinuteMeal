import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DINING_HALLS, fetchAllHallsMenu, fetchDiningHallStatuses, fetchHallMenu } from './lib/umassDining.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/halls', async (_req, res) => {
  try {
    const halls = await fetchDiningHallStatuses();
    res.json(halls);
  } catch (err) {
    console.error('Failed to fetch hall statuses:', err.message);
    res.status(502).json({ error: 'Failed to fetch hall statuses from UMass Dining.' });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const items = await fetchAllHallsMenu(date);
    res.json(items);
  } catch (err) {
    console.error('Failed to fetch combined menu:', err.message);
    res.status(502).json({ error: 'Failed to fetch menu data from UMass Dining.' });
  }
});

app.get('/api/menu/:hallId', async (req, res) => {
  const hallId = parseInt(req.params.hallId, 10);
  if (!DINING_HALLS.some(h => h.id === hallId)) {
    res.status(404).json({ error: 'Unknown dining hall id.' });
    return;
  }
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const items = await fetchHallMenu(hallId, date);
    res.json(items);
  } catch (err) {
    console.error(`Failed to fetch menu for hall ${hallId}:`, err.message);
    res.status(502).json({ error: 'Failed to fetch menu data from UMass Dining.' });
  }
});

app.listen(PORT, () => {
  console.log(`MinuteMeal web server listening on port ${PORT}`);
});
