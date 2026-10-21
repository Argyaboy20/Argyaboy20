// Push streak: consecutive days with >= 1 PushEvent. A fully closed day without a push resets it to 0.
const fs = require("fs");

const USER = process.env.GH_USER;
const TOKEN = process.env.GH_TOKEN;
const TZ = process.env.TZ_NAME || "Asia/Makassar";

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (date) => fmt.format(date); // YYYY-MM-DD in TZ
const addDays = (s, n) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function getPushDays() {
  const days = new Set();
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://api.github.com/users/${USER}/events?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const events = await res.json();
    if (!events.length) break;
    for (const e of events) if (e.type === "PushEvent") days.add(dayOf(new Date(e.created_at)));
  }
  return days;
}

(async () => {
  const pushDays = await getPushDays();
  const today = dayOf(new Date());
  const yesterday = addDays(today, -1);
  const statePath = "dist/streak.json";

  let state;
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    for (let d = addDays(state.closedThrough, 1); d <= yesterday; d = addDays(d, 1)) {
      state.closedStreak = pushDays.has(d) ? state.closedStreak + 1 : 0;
      state.longest = Math.max(state.longest, state.closedStreak);
    }
    state.closedThrough = yesterday;
  } else {
    // first run: count back from yesterday
    let s = 0;
    for (let d = yesterday; pushDays.has(d); d = addDays(d, -1)) s++;
    state = { closedStreak: s, closedThrough: yesterday, longest: s };
  }

  const pushedToday = pushDays.has(today);
  const current = state.closedStreak + (pushedToday ? 1 : 0);
  state.longest = Math.max(state.longest, current);
  state.updated = new Date().toISOString();

  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  const status = pushedToday ? "Pushed today ✓" : current > 0 ? "Push today to keep the streak alive!" : "Push today to start a new streak";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="150" viewBox="0 0 495 150" font-family="Segoe UI, Ubuntu, sans-serif">
  <rect x="0.5" y="0.5" width="494" height="149" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="247.5" y="30" text-anchor="middle" font-size="14" font-weight="600" fill="#58a6ff">PUSH STREAK · @${USER}</text>
  <line x1="247.5" y1="45" x2="247.5" y2="105" stroke="#30363d"/>
  <text x="123.75" y="80" text-anchor="middle" font-size="42" font-weight="700" fill="#f0883e">${current}</text>
  <text x="123.75" y="100" text-anchor="middle" font-size="12" fill="#8b949e">Current streak (days)</text>
  <text x="371.25" y="80" text-anchor="middle" font-size="42" font-weight="700" fill="#3fb950">${state.longest}</text>
  <text x="371.25" y="100" text-anchor="middle" font-size="12" fill="#8b949e">Longest streak (days)</text>
  <text x="247.5" y="132" text-anchor="middle" font-size="12" fill="${pushedToday ? "#3fb950" : "#d29922"}">${status}</text>
</svg>`;
  fs.writeFileSync("dist/streak.svg", svg);
  console.log({ today, pushedToday, current, longest: state.longest });
})().catch((e) => { console.error(e); process.exit(1); });