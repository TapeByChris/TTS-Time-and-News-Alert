// server.js - Forex Factory JSON backend + Yahoo Quotes proxy (CORS-safe)
// Works on Node 18+ (global fetch). If you're on Node <18, install node-fetch and uncomment the fallback.

const express = require('express');
const cors = require('cors');

// --- OPTIONAL: Node <18 fetch fallback ---
// const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());

// -----------------------------
// ForexFactory Calendar Caching
// -----------------------------

// Cache per "week file" so we don't spam Forex Factory
// Keys: lastweek, thisweek, nextweek
const caches = {
  lastweek: { data: null, fetchedAt: 0 },
  thisweek: { data: null, fetchedAt: 0 },
  nextweek: { data: null, fetchedAt: 0 }
};

const BASE_URL = 'https://nfs.faireconomy.media';
const TEN_MIN_MS = 10 * 60 * 1000;

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
      cache.data = []; // treat as empty
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

    console.log(
      `Request for ${dateQ} (today=${todayStr}, diff=${diffFromToday}), candidates: ${candidates.join(', ')}`
    );

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


// -----------------------------
// Yahoo Finance RSS Proxy
// -----------------------------
const YAHOO_RSS_URL = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US';
const YAHOO_RSS_TTL_MS = 60 * 1000;
let yahooRssCache = { data: null, fetchedAt: 0 };

app.get('/api/yahoo-rss', async (req, res) => {
  try {
    const now = Date.now();
    if (yahooRssCache.data && (now - yahooRssCache.fetchedAt) < YAHOO_RSS_TTL_MS) {
      return res.type('text/xml').send(yahooRssCache.data);
    }

    const r = await fetch(YAHOO_RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'
      }
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Yahoo RSS fetch failed:', r.status, txt.slice(0, 200));
      return res.status(502).json({ error: 'Yahoo RSS fetch failed' });
    }

    const text = await r.text();
    yahooRssCache = { data: text, fetchedAt: now };
    return res.type('text/xml').send(text);
  } catch (err) {
    console.error('Yahoo RSS endpoint error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// -----------------------------
// Yahoo Quotes Proxy + Caching
// -----------------------------
// This fixes “net change not popping up” by removing browser CORS/proxy issues.
// Frontend uses: http://localhost:3000/api/quotes?symbols=SPY,QQQ,^VIX

const QUOTES_CACHE_TTL_MS = 5 * 1000; // short TTL so it stays “live”
const quotesCache = new Map(); // key -> { data, fetchedAt }

// Normalizes symbols string so cache keys are consistent
function normalizeSymbols(symbols) {
  return (symbols || 'SPY,QQQ,^VIX')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .join(',');
}

app.get('/api/quotes', async (req, res) => {
  try {
    const symbols = normalizeSymbols(req.query.symbols);
    const now = Date.now();

    const cached = quotesCache.get(symbols);
    if (cached && (now - cached.fetchedAt) < QUOTES_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    console.log(`Fetching Yahoo quotes: ${symbols}`);

    const r = await fetch(url, {
      headers: {
        // Yahoo is more likely to respond cleanly with a browser-like UA
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Yahoo quote fetch failed:', r.status, txt.slice(0, 300));
      return res.status(502).json({ error: 'Yahoo fetch failed', status: r.status });
    }

    const data = await r.json();
    quotesCache.set(symbols, { data, fetchedAt: now });
    res.json(data);
  } catch (e) {
    console.error('Quotes endpoint error:', e);
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`FF calendar:  http://localhost:${PORT}/api/ff-calendar?date=${getTodayNY()}&countries=USD&imp=high,medium,low`);
  console.log(`Quotes:       http://localhost:${PORT}/api/quotes?symbols=SPY,QQQ,^VIX`);
});
