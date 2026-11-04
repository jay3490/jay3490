// Renders the profile's SVG cards (activity, languages, featured projects) from the
// GitHub GraphQL API in light and dark variants. Needs GITHUB_TOKEN; no dependencies.
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = "jay3490";
const OUT = new URL("../assets/", import.meta.url);
const FEATURED = [
  "document-intelligence-rag",
  "ecommerce-microservices-k8s",
  "realtime-location-tracking",
  "realtime-chat-signalr",
  "llm-gateway-dotnet",
  "mcp-server-dotnet",
  "semantic-kernel-agent",
  "langchain-rag-service",
  "langgraph-support-agent",
  "rag-eval-harness",
];
const LANGUAGE_EXCLUDE = new Set(["my-history", "jay3490", "github-slideshow", "dotnet-training"]);

const THEMES = {
  dark: { bg: "#0d1117", card: "#161b22", border: "#30363d", text: "#e6edf3", muted: "#8b949e", accent: "#a78bfa", accent2: "#22d3ee", track: "#21262d" },
  light: { bg: "#ffffff", card: "#f6f8fa", border: "#d0d7de", text: "#1f2328", muted: "#59636e", accent: "#7c3aed", accent2: "#0891b2", track: "#eaeef2" },
};
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");

function wrap(text, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line.trim());
      line = word;
    } else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,:;]*\S*$/, "") + "…";
  }
  return lines;
}

async function fetchData() {
  const { user } = await gql(
    `query($login:String!){ user(login:$login){
       createdAt
       contributionsCollection{ contributionYears }
       repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100){
         totalCount
         nodes{ name description url stargazerCount forkCount
           primaryLanguage{ name color }
           languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } }
           repositoryTopics(first:6){ nodes{ topic{ name } } } } } } }`,
    { login: LOGIN },
  );

  const days = [];
  for (const year of user.contributionsCollection.contributionYears) {
    const { user: y } = await gql(
      `query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login){
         contributionsCollection(from:$from, to:$to){ contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
      { login: LOGIN, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    );
    for (const w of y.contributionsCollection.contributionCalendar.weeks) days.push(...w.contributionDays);
  }
  const today = new Date().toISOString().slice(0, 10);
  const calendar = [...new Map(days.filter((d) => d.date <= today).map((d) => [d.date, d.contributionCount])).entries()]
    .sort(([a], [b]) => a.localeCompare(b));
  return { repos: user.repositories.nodes, repoCount: user.repositories.totalCount, calendar };
}

function activityStats(calendar) {
  const total = calendar.reduce((s, [, c]) => s + c, 0);
  let longest = 0;
  let run = 0;
  for (const [, c] of calendar) {
    run = c > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today not having a contribution yet doesn't break the current streak.
  let current = 0;
  let i = calendar.length - 1;
  if (i >= 0 && calendar[i][1] === 0) i--;
  for (; i >= 0 && calendar[i][1] > 0; i--) current++;
  const lastYear = calendar.slice(-364);
  const weeks = [];
  for (let w = 0; w < 52; w++) weeks.push(lastYear.slice(w * 7, w * 7 + 7).reduce((s, [, c]) => s + c, 0));
  const activeDays = lastYear.filter(([, c]) => c > 0).length;
  const year = new Date().getUTCFullYear().toString();
  const thisYear = calendar.filter(([d]) => d.startsWith(year)).reduce((s, [, c]) => s + c, 0);
  return { total, longest, current, thisYear, weeks, activeDays, lastYearTotal: lastYear.reduce((s, [, c]) => s + c, 0) };
}

function activityCard(t, s, repoCount) {
  const W = 500, H = 200;
  const max = Math.max(...s.weeks, 1);
  const pts = s.weeks.map((v, i) => [24 + i * (452 / 51), 176 - (v / max) * 46]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L476,176 L24,176 Z`;
  const stat = (x, value, label, delay) => `
    <g class="fade" style="animation-delay:${delay}ms">
      <text x="${x}" y="78" class="value">${esc(value)}</text>
      <text x="${x}" y="98" class="label">${esc(label)}</text>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub activity">
  <title>GitHub activity</title>
  <style>
    .title{font:600 16px ${FONT};fill:${t.text}}
    .sub{font:400 12px ${FONT};fill:${t.muted}}
    .value{font:700 24px ${FONT};fill:${t.text}}
    .label{font:400 11.5px ${FONT};fill:${t.muted}}
    .fade{animation:fade .6s ease backwards}
    .draw{stroke-dasharray:1200;animation:draw 2s ease backwards .4s}
    @keyframes fade{from{opacity:0}}
    @keyframes draw{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}
  </style>
  <defs>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
    <linearGradient id="a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".28"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <text x="24" y="34" class="title">GitHub activity</text>
  <text x="476" y="34" class="sub" text-anchor="end">all time</text>
  ${stat(24, fmt(s.total), "total contributions", 0)}
  ${stat(150, fmt(s.thisYear), `in ${new Date().getUTCFullYear()}`, 120)}
  ${stat(268, `${s.longest} days`, "longest streak", 240)}
  ${stat(392, fmt(repoCount), "public repos", 360)}
  <path d="${area}" fill="url(#a)" class="fade" style="animation-delay:900ms"/>
  <path d="${line}" fill="none" stroke="url(#g)" stroke-width="2.2" stroke-linejoin="round" class="draw"/>
  <line x1="24" y1="176.5" x2="476" y2="176.5" stroke="${t.track}"/>
  <text x="24" y="192" class="label">${fmt(s.lastYearTotal)} contributions on ${s.activeDays} days in the last year</text>
</svg>`;
}

function languageTotals(repos) {
  const totals = new Map();
  for (const r of repos) {
    if (LANGUAGE_EXCLUDE.has(r.name)) continue;
    for (const e of r.languages.edges) {
      const cur = totals.get(e.node.name) ?? { size: 0, color: e.node.color ?? "#8b949e" };
      cur.size += e.size;
      totals.set(e.node.name, cur);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1].size - a[1].size);
  const sum = sorted.reduce((s, [, v]) => s + v.size, 0);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, [, v]) => s + v.size, 0);
  if (rest > 0) top.push(["Other", { size: rest, color: "#8b949e" }]);
  return top.map(([name, v]) => ({ name, color: v.color, pct: (v.size / sum) * 100 }));
}

function languageCard(t, langs) {
  const W = 500, H = 200;
  let x = 24;
  const bar = langs.map((l) => {
    const w = (452 * l.pct) / 100;
    const seg = `<rect x="${x.toFixed(2)}" y="58" width="${Math.max(w, 0.5).toFixed(2)}" height="10" fill="${l.color}"/>`;
    x += w;
    return seg;
  }).join("");
  const legend = langs.map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = 24 + col * 230, ly = 98 + row * 24;
    return `<g class="fade" style="animation-delay:${300 + i * 90}ms">
      <circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${l.color}"/>
      <text x="${lx + 20}" y="${ly}" class="lang">${esc(l.name)}</text>
      <text x="${lx + 210}" y="${ly}" class="pct" text-anchor="end">${l.pct.toFixed(1)}%</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
  <title>Most used languages</title>
  <style>
    .title{font:600 16px ${FONT};fill:${t.text}}
    .sub{font:400 12px ${FONT};fill:${t.muted}}
    .lang{font:500 13px ${FONT};fill:${t.text}}
    .pct{font:400 12.5px ${FONT};fill:${t.muted}}
    .fade{animation:fade .6s ease backwards}
    .grow{transform-origin:24px 63px;animation:grow 1.2s cubic-bezier(.2,.8,.2,1) backwards .1s}
    @keyframes fade{from{opacity:0}}
    @keyframes grow{from{transform:scaleX(0)}}
  </style>
  <defs><clipPath id="c"><rect x="24" y="58" width="452" height="10" rx="5"/></clipPath></defs>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <text x="24" y="34" class="title">Most used languages</text>
  <text x="476" y="34" class="sub" text-anchor="end">by code size</text>
  <rect x="24" y="58" width="452" height="10" rx="5" fill="${t.track}"/>
  <g clip-path="url(#c)"><g class="grow">${bar}</g></g>
  ${legend}
</svg>`;
}

function projectCard(t, repo) {
  const W = 400, H = 150;
  const desc = wrap(repo.description ?? "", 58, 3);
  const topics = repo.repositoryTopics.nodes.map((n) => n.topic.name).slice(0, 4);
  let tx = 20;
  const chips = topics.map((name) => {
    const w = name.length * 6.4 + 16;
    if (tx + w > W - 20) return "";
    const chip = `<rect x="${tx}" y="114" width="${w}" height="20" rx="10" fill="${t.card}" stroke="${t.border}"/>
      <text x="${tx + w / 2}" y="128" class="chip" text-anchor="middle">${esc(name)}</text>`;
    tx += w + 6;
    return chip;
  }).join("");
  const lang = repo.primaryLanguage;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(repo.name)}">
  <title>${esc(repo.name)}</title>
  <style>
    .name{font:600 15px ${FONT};fill:${t.accent}}
    .desc{font:400 12.5px ${FONT};fill:${t.muted}}
    .meta{font:400 12px ${FONT};fill:${t.muted}}
    .chip{font:500 11px ${FONT};fill:${t.text}}
  </style>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <svg x="20" y="17" width="16" height="16" viewBox="0 0 16 16"><path fill="${t.muted}" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>
  <text x="44" y="30" class="name">${esc(repo.name)}</text>
  ${lang ? `<circle cx="${W - 20 - lang.name.length * 6.6 - 10}" cy="25.5" r="5" fill="${lang.color}"/><text x="${W - 20}" y="30" class="meta" text-anchor="end">${esc(lang.name)}</text>` : ""}
  ${desc.map((l, i) => `<text x="20" y="${58 + i * 18}" class="desc">${esc(l)}</text>`).join("")}
  ${chips}
</svg>`;
}

function banner(t) {
  const W = 1200, H = 260;
  const roles = ["Full-Stack &amp; AI Engineer", ".NET · Angular · Azure · Kubernetes", "Microservices · Event-driven · RAG &amp; LLM apps"];
  const cycle = roles.length * 4;
  const role = (text, i) => {
    const start = (i * 4 / cycle) * 100, end = ((i * 4 + 4) / cycle) * 100;
    const k = (p) => (start + (end - start) * p).toFixed(2);
    return `<g style="animation:r${i} ${cycle}s infinite"${i ? ' opacity="0"' : ""}>
      <text x="72" y="182" class="role">${text}</text></g>
    <style>@keyframes r${i}{0%,${(+k(0)).toFixed(2)}%{opacity:0;transform:translateY(8px)}${k(0.08)}%,${k(0.86)}%{opacity:1;transform:none}${k(0.96)}%,100%{opacity:0;transform:translateY(-8px)}}</style>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Jay Ahir — Full-Stack &amp; AI Engineer">
  <title>Jay Ahir — Full-Stack &amp; AI Engineer</title>
  <style>
    .name{font:800 64px ${FONT};fill:${t.text};letter-spacing:-1px}
    .role{font:500 26px ${FONT};fill:url(#tg)}
    .hint{font:500 15px ${FONT};fill:${t.muted};letter-spacing:2px}
    .blob{animation:float 14s ease-in-out infinite alternate}
    .blob2{animation:float 18s ease-in-out infinite alternate-reverse}
    .caret{animation:blink 1s steps(1) infinite}
    .in{animation:in .9s ease backwards}
    @keyframes float{from{transform:translate(0,0)}to{transform:translate(-60px,24px)}}
    @keyframes blink{50%{opacity:0}}
    @keyframes in{from{opacity:0;transform:translateY(12px)}}
  </style>
  <defs>
    <linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
    <radialGradient id="b1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".35"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="b2"><stop offset="0" stop-color="${t.accent2}" stop-opacity=".3"/><stop offset="1" stop-color="${t.accent2}" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="${t.border}"/></pattern>
    <clipPath id="clip"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <rect width="${W}" height="${H}" fill="url(#dots)" opacity=".6"/>
    <circle class="blob" cx="980" cy="60" r="260" fill="url(#b1)"/>
    <circle class="blob2" cx="760" cy="250" r="220" fill="url(#b2)"/>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${t.border}"/>
  <text x="74" y="78" class="hint in">HI THERE, I'M</text>
  <text x="70" y="140" class="name in" style="animation-delay:.15s">Jay Ahir</text>
  <rect x="72" y="198" width="56" height="4" rx="2" fill="url(#tg)" class="in" style="animation-delay:.3s"/>
  ${roles.map(role).join("")}
  <g transform="translate(1040 130)" opacity=".9">
    <g style="animation:float 9s ease-in-out infinite alternate">
      <rect x="-70" y="-60" width="140" height="120" rx="16" fill="${t.card}" stroke="${t.border}"/>
      <circle cx="-48" cy="-40" r="4" fill="#ff5f57"/><circle cx="-34" cy="-40" r="4" fill="#febc2e"/><circle cx="-20" cy="-40" r="4" fill="#28c840"/>
      <rect x="-50" y="-18" width="64" height="6" rx="3" fill="${t.accent}"/>
      <rect x="-50" y="-4" width="92" height="6" rx="3" fill="${t.muted}" opacity=".5"/>
      <rect x="-38" y="10" width="72" height="6" rx="3" fill="${t.accent2}"/>
      <rect x="-38" y="24" width="44" height="6" rx="3" fill="${t.muted}" opacity=".5"/>
      <rect x="-50" y="38" width="10" height="6" rx="1" fill="${t.text}" class="caret"/>
    </g>
  </g>
</svg>`;
}

const data = await fetchData();
const stats = activityStats(data.calendar);
const langs = languageTotals(data.repos);
mkdirSync(new URL("cards/", OUT), { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(new URL(`banner-${name}.svg`, OUT), banner(t));
  writeFileSync(new URL(`activity-${name}.svg`, OUT), activityCard(t, stats, data.repoCount));
  writeFileSync(new URL(`languages-${name}.svg`, OUT), languageCard(t, langs));
  for (const repoName of FEATURED) {
    const repo = data.repos.find((r) => r.name === repoName);
    if (repo) writeFileSync(new URL(`cards/${repoName}-${name}.svg`, OUT), projectCard(t, repo));
  }
}
console.log(`contributions=${stats.total} current=${stats.current} longest=${stats.longest} repos=${data.repoCount} langs=${langs.map((l) => l.name).join(",")}`);
