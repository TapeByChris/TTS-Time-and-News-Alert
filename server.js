// server.js - Forex Factory JSON backend with robust week handling
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Cache per "week file" so we don't spam Forex Factory
// Keys: lastweek, thisweek, nextweek
const caches = {
  lastweek: { data: null, fetchedAt: 0 },
  thisweek: { data: null, fetchedAt: 0 },
  nextweek: { data: null, fetchedAt: 0 }
};

const BASE_URL = 'https://nfs.faireconomy.media';
const TEN_MIN_MS = 10 * 60 * 1000;

// --- Helpers ---

// NY-local YYYY-MM-DD for "today"
function getTodayNY() {
  const now = new Date();
  const nyString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const ny = new Date(nyString);
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Load one FF JSON file by suffix (thisweek/lastweek/nextweek) with caching
async function loadWeekFile(suffix) {
  const cache = caches[suffix];
  const now = Date.now();

  if (cache.data && (now - cache.fetchedAt) < TEN_MIN_MS) {
    return cache.data;
  }

  const url = `${BASE_URL}/ff_calendar_${suffix}.json`;
  console.log(`Fetching Forex Factory data: ${url}`);

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`FF fetch error for ${suffix}:`, resp.status, txt);
      cache.data = [];          // treat as empty
      cache.fetchedAt = now;
      return cache.data;
    }
    const json = await resp.json();
    cache.data = Array.isArray(json) ? json : [];
    cache.fetchedAt = now;
    return cache.data;
  } catch (err) {
    console.error(`FF fetch exception for ${suffix}:`, err);
    cache.data = [];
    cache.fetchedAt = now;
    return cache.data;
  }
}

// Absolute day difference between two YYYY-MM-DD strings
function dayDiff(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((da - db) / msPerDay);
}

// /api/ff-calendar?date=YYYY-MM-DD&countries=USD,EUR&imp=high,medium,low
app.get('/api/ff-calendar', async (req, res) => {
  try {
    const todayStr = getTodayNY();
    const dateQ = req.query.date || todayStr; // requested calendar date

    // Country filter: "USD,EUR"
    const countriesQ = (req.query.countries || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    // Impact filter: "high,medium,low"
    const impactsQ = (req.query.imp || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    // Decide which week files to search, in order.
    // Always try THISWEEK first, then LASTWEEK/NEXTWEEK if the date is close.
    const diffFromToday = dayDiff(dateQ, todayStr); // positive = dateQ after today
    const candidates = ['thisweek'];

    if (diffFromToday < 0 && diffFromToday >= -7) {
      candidates.push('lastweek');
    } else if (diffFromToday > 0 && diffFromToday <= 7) {
      candidates.push('nextweek');
    }

    console.log(`Request for ${dateQ} (today=${todayStr}, diff=${diffFromToday}), candidates: ${candidates.join(', ')}`);

    let dataForDate = [];

    for (const suffix of candidates) {
      const weekData = await loadWeekFile(suffix);
      const subset = weekData.filter(ev => {
        if (!ev.date) return false;
        const d = ev.date.slice(0, 10); // "YYYY-MM-DD"
        return d === dateQ;
      });

      if (subset.length > 0) {
        console.log(`Found ${subset.length} events for ${dateQ} in ${suffix}`);
        dataForDate = subset;
        break;
      }
    }

    // If nothing found in any candidate, dataForDate stays [].

    // Filter by countries if provided
    if (countriesQ.length) {
      dataForDate = dataForDate.filter(ev =>
        ev.country && countriesQ.includes(ev.country.toUpperCase())
      );
    }

    // Filter by impact if provided (High/Medium/Low/Holiday)
    if (impactsQ.length) {
      dataForDate = dataForDate.filter(ev =>
        ev.impact && impactsQ.includes(ev.impact.toLowerCase())
      );
    }

    // Sort by time ascending
    dataForDate.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(dataForDate);
  } catch (err) {
    console.error('FF calendar endpoint error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FF calendar backend running at http://localhost:${PORT}`);
});
