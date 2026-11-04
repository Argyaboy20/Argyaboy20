// Streak = consecutive days with >= 1 contribution, using the same GitHub data as the green squares on the profile.
const fs = require("fs");

const USER = process.env.GH_USER;
const TOKEN = process.env.GH_TOKEN;

const addDays = (s, n) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function getCalendar() {
  const to = new Date();
  const from = new Date(to.getTime() - 364 * 864e5);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ weeks{ contributionDays{ date contributionCount } } }
    } }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER, from: from.toISOString(), to: to.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API ${res.status} ${JSON.stringify(json.errors || "")}`);
  const todayUTC = to.toISOString().slice(0, 10);
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => d.date <= todayUTC)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

(async () => {
  const days = await getCalendar();
  const map = new Map(days.map((d) => [d.date, d.contributionCount]));
  const today = days[days.length - 1].date;
  const doneToday = map.get(today) > 0;

  // current: count back from today (or from yesterday if today has nothing yet)
  let current = 0;
  for (let d = doneToday ? today : addDays(today, -1); map.get(d) > 0; d = addDays(d, -1)) current++;

  // longest within the fetched year
  let run = 0, best = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; best = Math.max(best, run); }

  const statePath = "dist/streak.json";
  let prevLongest = 0;
  if (fs.existsSync(statePath)) { try { prevLongest = JSON.parse(fs.readFileSync(statePath, "utf8")).longest || 0; } catch {} }
  const longest = Math.max(prevLongest, best, current);

  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ longest, updated: new Date().toISOString() }, null, 2));

  const status = doneToday ? "Contributed today ✓" : current > 0 ? "Push today to keep the streak alive!" : "Push today to start a new streak";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="150" viewBox="0 0 495 150" font-family="Segoe UI, Ubuntu, sans-serif">
  <rect x="0.5" y="0.5" width="494" height="149" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="247.5" y="30" text-anchor="middle" font-size="14" font-weight="600" fill="#58a6ff">PUSH STREAK · @${USER}</text>
  <line x1="247.5" y1="45" x2="247.5" y2="105" stroke="#30363d"/>
  <text x="123.75" y="80" text-anchor="middle" font-size="42" font-weight="700" fill="#f0883e">${current}</text>
  <text x="123.75" y="100" text-anchor="middle" font-size="12" fill="#8b949e">Current streak (days)</text>
  <text x="371.25" y="80" text-anchor="middle" font-size="42" font-weight="700" fill="#3fb950">${longest}</text>
  <text x="371.25" y="100" text-anchor="middle" font-size="12" fill="#8b949e">Longest streak (days)</text>
  <text x="247.5" y="132" text-anchor="middle" font-size="12" fill="${doneToday ? "#3fb950" : "#d29922"}">${status}</text>
  <text x="247.5" y="145" text-anchor="middle" font-size="9" fill="#6e7681">updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</text>
</svg>`;
  fs.writeFileSync("dist/streak.svg", svg);
  console.log({ today, doneToday, current, longest });
})().catch((e) => { console.error(e); process.exit(1); });