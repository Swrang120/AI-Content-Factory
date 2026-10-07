const https = require("https");

function jsonFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || "GET",
      headers: { "Accept": "application/json", ...(options.headers || {}) },
      timeout: options.timeout || 12000,
    }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        let body;
        try { body = JSON.parse(data); } catch { body = { raw: data }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error("HTTP " + res.statusCode + ": " + String(body?.message || body?.error || body?.raw || "Provider error").slice(0, 300)));
      });
    });
    req.on("timeout", () => req.destroy(new Error("Provider timeout")));
    req.on("error", reject);
    req.end();
  });
}

const PROVIDERS = {
  newsapi: { name: "NewsAPI", category: "News", auth: "API key", env: "NEWSAPI_KEY", keyRequired: true },
  gnews: { name: "GNews", category: "News", auth: "API key", env: "GNEWS_API_KEY", keyRequired: true },
  newsdata: { name: "NewsData", category: "News", auth: "API key", env: "NEWSDATA_API_KEY", keyRequired: true },
  marketaux: { name: "MarketAux", category: "Finance/News", auth: "API key", env: "MARKETAUX_API_KEY", keyRequired: true },
  noozra: { name: "Noozra", category: "News", auth: "No key listed", env: null, keyRequired: false },
  openmeteo: { name: "Open-Meteo", category: "Weather", auth: "No key", env: null, keyRequired: false },
  frankfurter: { name: "Frankfurter", category: "Currency", auth: "No key", env: null, keyRequired: false },
  exchangeratehost: { name: "ExchangeRate.host", category: "Currency", auth: "API key / plan dependent", env: "EXCHANGERATE_HOST_KEY", keyRequired: false },
  thesportsdb: { name: "TheSportsDB", category: "Sports", auth: "Key/plan dependent", env: "THESPORTSDB_API_KEY", keyRequired: false },
  deezer: { name: "Deezer", category: "Music", auth: "Public API", env: null, keyRequired: false },
  discogs: { name: "Discogs", category: "Music", auth: "Token", env: "DISCOGS_TOKEN", keyRequired: false },
  bandsintown: { name: "Bandsintown", category: "Music", auth: "App ID", env: "BANDSINTOWN_APP_ID", keyRequired: false },
  freesound: { name: "Freesound", category: "Audio", auth: "API key", env: "FREESOUND_API_KEY", keyRequired: true },
  linkpreview: { name: "LinkPreview", category: "Web research", auth: "API key", env: "LINKPREVIEW_API_KEY", keyRequired: true },
  microlink: { name: "Microlink", category: "Web research", auth: "No key for basic use", env: "MICROLINK_API_KEY", keyRequired: false }
};

function configured(id) {
  const p = PROVIDERS[id];
  return !!p && (!p.keyRequired || !p.env || !!process.env[p.env]);
}

async function searchNewsApi(q) {
  const key = process.env.NEWSAPI_KEY;
  if (!key) throw new Error("NEWSAPI_KEY not configured");
  const u = new URL("https://newsapi.org/v2/everything");
  u.searchParams.set("q", q); u.searchParams.set("language", "en");
  u.searchParams.set("sortBy", "publishedAt"); u.searchParams.set("pageSize", "10");
  const b = await jsonFetch(u, { headers: { "X-Api-Key": key } });
  return (b.articles || []).map(x => ({ title:x.title, description:x.description, url:x.url, source:x.source?.name, publishedAt:x.publishedAt, provider:"NewsAPI" }));
}

async function searchGNews(q) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) throw new Error("GNEWS_API_KEY not configured");
  const u = new URL("https://gnews.io/api/v4/search");
  u.searchParams.set("q", q); u.searchParams.set("lang", "en"); u.searchParams.set("max", "10"); u.searchParams.set("apikey", key);
  const b = await jsonFetch(u);
  return (b.articles || []).map(x => ({ title:x.title, description:x.description, url:x.url, source:x.source?.name, publishedAt:x.publishedAt, provider:"GNews" }));
}

async function searchNewsData(q) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) throw new Error("NEWSDATA_API_KEY not configured");
  const u = new URL("https://newsdata.io/api/1/latest");
  u.searchParams.set("apikey", key); u.searchParams.set("q", q); u.searchParams.set("language", "en"); u.searchParams.set("size", "10");
  const b = await jsonFetch(u);
  return (b.results || []).map(x => ({ title:x.title, description:x.description, url:x.link, source:x.source_name, publishedAt:x.pubDate, provider:"NewsData" }));
}

async function searchMarketAux(q) {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) throw new Error("MARKETAUX_API_KEY not configured");
  const u = new URL("https://api.marketaux.com/v1/news/all");
  u.searchParams.set("api_token", key); u.searchParams.set("search", q); u.searchParams.set("language", "en"); u.searchParams.set("limit", "10");
  const b = await jsonFetch(u);
  return (b.data || []).map(x => ({ title:x.title, description:x.description, url:x.url, source:x.source, publishedAt:x.published_at, provider:"MarketAux", sentiment:x.sentiment }));
}

async function searchNoozra(q) {
  const u = new URL("https://noozra.com/api/search");
  u.searchParams.set("q", q);
  const b = await jsonFetch(u);
  const items = Array.isArray(b) ? b : (b.articles || b.results || []);
  return items.slice(0,10).map(x => ({ title:x.title, description:x.description, url:x.url || x.link, source:x.source, publishedAt:x.publishedAt || x.pubDate, provider:"Noozra" }));
}

async function weather(lat, lon) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", String(lat)); u.searchParams.set("longitude", String(lon));
  u.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
  u.searchParams.set("timezone", "auto");
  const b = await jsonFetch(u);
  return { provider:"Open-Meteo", latitude:b.latitude, longitude:b.longitude, current:b.current };
}

async function fx(base = "USD", symbols = "INR") {
  const u = new URL("https://api.frankfurter.app/latest");
  u.searchParams.set("from", base); u.searchParams.set("to", symbols);
  const b = await jsonFetch(u);
  return { provider:"Frankfurter", ...b };
}

async function searchDeezer(q) {
  const u = new URL("https://api.deezer.com/search");
  u.searchParams.set("q", q); u.searchParams.set("limit", "10");
  const b = await jsonFetch(u);
  return (b.data || []).map(x => ({ title:x.title, artist:x.artist?.name, album:x.album?.title, url:x.link, cover:x.album?.cover_medium, provider:"Deezer" }));
}

async function searchDiscogs(q) {
  const u = new URL("https://api.discogs.com/database/search");
  u.searchParams.set("q", q); u.searchParams.set("type", "release"); u.searchParams.set("per_page", "10");
  if (process.env.DISCOGS_TOKEN) u.searchParams.set("token", process.env.DISCOGS_TOKEN);
  const b = await jsonFetch(u, { headers: process.env.DISCOGS_TOKEN ? { "User-Agent": "AI-Content-Factory/1.0" } : {} });
  return (b.results || []).map(x => ({ title:x.title, year:x.year, type:x.type, url:x.resource_url, image:x.cover_image, provider:"Discogs" }));
}

async function searchLinkPreview(url) {
  const key = process.env.LINKPREVIEW_API_KEY;
  if (!key) throw new Error("LINKPREVIEW_API_KEY not configured");
  const u = new URL("https://api.linkpreview.net");
  u.searchParams.set("q", url); u.searchParams.set("key", key);
  const b = await jsonFetch(u);
  return { provider:"LinkPreview", title:b.title, description:b.description, image:b.image, url:b.url };
}

async function searchMicrolink(url) {
  const u = new URL("https://api.microlink.io");
  u.searchParams.set("url", url);
  if (process.env.MICROLINK_API_KEY) u.searchParams.set("apiKey", process.env.MICROLINK_API_KEY);
  const b = await jsonFetch(u);
  return { provider:"Microlink", data:b.data || b };
}

async function search(provider, query) {
  switch (provider) {
    case "newsapi": return searchNewsApi(query);
    case "gnews": return searchGNews(query);
    case "newsdata": return searchNewsData(query);
    case "marketaux": return searchMarketAux(query);
    case "noozra": return searchNoozra(query);
    case "deezer": return searchDeezer(query);
    case "discogs": return searchDiscogs(query);
    case "linkpreview": return searchLinkPreview(query);
    case "microlink": return searchMicrolink(query);
    default: throw new Error("Provider is not a text-search provider: " + provider);
  }
}

async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/research/providers") {
    return res.json({ ok:true, providers:Object.entries(PROVIDERS).map(([id,p]) => ({id,...p,configured:configured(id)})) });
  }
  if (url.pathname === "/api/research/search" && req.method === "POST") {
    const body = req.body || {};
    const query = String(body.query || "").trim().slice(0, 300);
    const requested = Array.isArray(body.providers) && body.providers.length ? body.providers : ["newsapi","gnews","newsdata","noozra","marketaux"];
    if (!query) return res.status(400).json({ok:false,error:"query is required"});
    const selected = requested.filter(id => PROVIDERS[id]);
    const results = await Promise.allSettled(selected.filter(configured).map(async id => ({ provider:id, items:await search(id,query) })));
    const data = results.filter(x => x.status === "fulfilled").map(x => x.value);
    const errors = results.filter(x => x.status === "rejected").map((x,i) => ({ provider:selected[i], error:String(x.reason?.message || x.reason) }));
    return res.json({ok:true,query,results:data,errors});
  }
  if (url.pathname === "/api/research/weather") {
    const lat = Number(url.searchParams.get("lat")); const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ok:false,error:"lat and lon are required"});
    return res.json({ok:true,data:await weather(lat,lon)});
  }
  if (url.pathname === "/api/research/fx") {
    return res.json({ok:true,data:await fx(url.searchParams.get("base") || "USD", url.searchParams.get("to") || "INR")});
  }
  return null;
}

module.exports = { handler, PROVIDERS };
