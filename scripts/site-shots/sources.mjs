// Source "screenshots" for scripts/build-site-shots.mjs. Fictional products
// (Lumen, Tasklane, Orbit, Stride) rendered as plain HTML, so the marketing
// images show SnapShotPro styling a realistic app UI without borrowing anyone
// else's product. Geist is inlined from .ogfonts/ so output is identical on
// every machine.
import { readFileSync } from 'fs';

const font = (w) => `@font-face{font-family:Geist;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(`.ogfonts/Geist-${w}.ttf`).toString('base64')}) format('truetype');}`;
const FONTS = [400, 500, 600, 700].map(font).join('');

const page = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:Geist,sans-serif;-webkit-font-smoothing:antialiased}
${css}</style></head><body>${body}</body></html>`;

const spark = (pts, color) => {
  const w = 220, h = 56, max = Math.max(...pts), min = Math.min(...pts);
  const xy = pts.map((p, i) => [i * (w / (pts.length - 1)), h - 6 - ((p - min) / (max - min || 1)) * (h - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><defs><linearGradient id="g${color.slice(1)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w},${h} L0,${h} Z" fill="url(#g${color.slice(1)})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
};

// ── Lumen: analytics dashboard (1440x900) ────────────────────────────────────
const bars = [42, 55, 48, 62, 70, 66, 78, 74, 88, 82, 94, 100];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dashboard = page(`
body{background:#f6f7fb;color:#0f1424;display:flex}
.side{width:232px;background:#0f1424;color:#c9cfe4;padding:26px 18px;display:flex;flex-direction:column;gap:4px}
.brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:19px;margin:0 8px 26px}
.logo{width:30px;height:30px;border-radius:9px;background:conic-gradient(from 200deg,#7c5cff,#2fd3c6,#7c5cff)}
.nav{padding:10px 12px;border-radius:10px;font-size:14px;font-weight:500;display:flex;gap:11px;align-items:center}
.nav i{width:16px;height:16px;border-radius:5px;border:2px solid currentColor;opacity:.7}
.nav.on{background:#1d2440;color:#fff}
.side .foot{margin-top:auto;padding:14px;border-radius:12px;background:#171e36;font-size:12.5px;line-height:1.5}
.side .foot b{color:#fff;display:block;margin-bottom:4px}
main{flex:1;padding:30px 36px;display:flex;flex-direction:column;gap:22px}
.top{display:flex;align-items:center;justify-content:space-between}
h1{font-size:26px;font-weight:700;letter-spacing:-.02em}
.sub{color:#6b7390;font-size:14px;margin-top:4px}
.pill{display:flex;gap:6px;background:#fff;border:1px solid #e6e8f0;border-radius:11px;padding:4px}
.pill span{padding:7px 13px;font-size:13px;font-weight:500;border-radius:8px;color:#6b7390}
.pill span.on{background:#0f1424;color:#fff}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.card{background:#fff;border:1px solid #e9ebf2;border-radius:16px;padding:18px 20px;box-shadow:0 1px 2px rgba(15,20,36,.04)}
.kpi .l{font-size:13px;color:#6b7390;font-weight:500}
.kpi .v{font-size:28px;font-weight:700;letter-spacing:-.02em;margin:6px 0 2px}
.up{color:#0f9f6e;font-size:12.5px;font-weight:600}.dn{color:#e5484d;font-size:12.5px;font-weight:600}
.row{display:grid;grid-template-columns:1.7fr 1fr;gap:16px;flex:1}
.chart{display:flex;flex-direction:column}
.chart h3,.list h3{font-size:15px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
.chart h3 small{font-weight:500;color:#6b7390;font-size:12.5px}
.bars{display:flex;align-items:flex-end;gap:14px;flex:1;margin-top:22px;padding:0 4px;border-bottom:1px dashed #e3e6ef}
.bar{flex:1;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#7c5cff,#5b8cff)}
.bar.dim{background:#e7e4ff}
.mon{display:flex;gap:14px;padding:8px 4px 0}.mon span{flex:1;text-align:center;font-size:11.5px;color:#8a91aa}
.item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f1f6;font-size:14px}
.item:last-child{border:0}
.av{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px}
.item .n{flex:1}.item .n small{display:block;color:#8a91aa;font-size:12px;margin-top:2px}
.item .a{font-weight:600}
`, `
<aside class="side"><div class="brand"><div class="logo"></div>Lumen</div>
<div class="nav on"><i></i>Overview</div><div class="nav"><i></i>Revenue</div><div class="nav"><i></i>Customers</div><div class="nav"><i></i>Funnels</div><div class="nav"><i></i>Experiments</div><div class="nav"><i></i>Settings</div>
<div class="foot"><b>Q4 goal: 82% reached</b>On track to hit $1.2M ARR by December.</div></aside>
<main>
<div class="top"><div><h1>Good morning, Ava</h1><div class="sub">Here's how Lumen is doing this month.</div></div>
<div class="pill"><span>7d</span><span class="on">30d</span><span>90d</span><span>12m</span></div></div>
<div class="kpis">
<div class="card kpi"><div class="l">Revenue</div><div class="v">$98,420</div><span class="up">▲ 12.4%</span>${spark([4,6,5,8,7,9,11,10,13,14], '#7c5cff')}</div>
<div class="card kpi"><div class="l">Active users</div><div class="v">24,180</div><span class="up">▲ 8.1%</span>${spark([5,5,6,7,6,8,8,9,10,11], '#2fb8c6')}</div>
<div class="card kpi"><div class="l">Conversion</div><div class="v">4.62%</div><span class="up">▲ 0.6 pts</span>${spark([3,4,4,3,5,5,6,5,6,7], '#0f9f6e')}</div>
<div class="card kpi"><div class="l">Churn</div><div class="v">1.9%</div><span class="dn">▼ 0.3 pts</span>${spark([9,8,8,7,7,6,6,5,5,4], '#f08a3c')}</div>
</div>
<div class="row">
<div class="card chart"><h3>Monthly recurring revenue <small>2026 · USD</small></h3>
<div class="bars">${bars.map((b, i) => `<div class="bar${i < 9 ? '' : ''}" style="height:${b}%"></div>`).join('')}</div>
<div class="mon">${months.map((m) => `<span>${m}</span>`).join('')}</div></div>
<div class="card list"><h3>Top accounts</h3>
${[['Northbeam', 'Enterprise · 412 seats', '$18.2k', '#7c5cff'], ['Fieldnote', 'Growth · 88 seats', '$9.6k', '#2fb8c6'], ['Paperplane', 'Growth · 64 seats', '$7.1k', '#f08a3c'], ['Kilnworks', 'Starter · 21 seats', '$2.4k', '#0f9f6e'], ['Moss & Co', 'Starter · 12 seats', '$1.3k', '#e5484d']]
  .map(([n, s, a, c]) => `<div class="item"><div class="av" style="background:${c}">${n[0]}</div><div class="n">${n}<small>${s}</small></div><div class="a">${a}</div></div>`).join('')}
</div></div></main>`);

// ── Tasklane: kanban board (1440x900) ────────────────────────────────────────
const card = (t, tag, c, n) => `<div class="k"><span class="tag" style="background:${c}1f;color:${c}">${tag}</span><p>${t}</p><div class="meta"><span>◷ ${n}</span><span class="ppl"><b style="background:#7c5cff"></b><b style="background:#f08a3c"></b></span></div></div>`;
export const kanban = page(`
body{background:#fbfaf7;color:#1c1b19}
header{height:64px;display:flex;align-items:center;gap:18px;padding:0 30px;border-bottom:1px solid #ece9e1;background:#fff}
.lg{font-weight:700;font-size:18px;display:flex;gap:9px;align-items:center}.lg i{width:24px;height:24px;border-radius:7px;background:#ff6b3d}
.tabs{display:flex;gap:4px;margin-left:24px}.tabs span{padding:8px 14px;border-radius:9px;font-size:14px;color:#77736a;font-weight:500}.tabs .on{background:#f3f0e8;color:#1c1b19}
.search{margin-left:auto;width:280px;height:38px;border-radius:10px;border:1px solid #ece9e1;background:#fbfaf7;color:#a29d92;font-size:13.5px;display:flex;align-items:center;padding:0 14px}
.btn{height:38px;padding:0 16px;border-radius:10px;background:#1c1b19;color:#fff;font-size:13.5px;font-weight:600;display:flex;align-items:center}
.wrap{padding:26px 30px}
h1{font-size:24px;font-weight:700;letter-spacing:-.02em}.wrap>p{color:#77736a;font-size:14px;margin:4px 0 22px}
.cols{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.col{background:#f3f0e8;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px;min-height:560px}
.col h4{font-size:13.5px;font-weight:600;display:flex;justify-content:space-between;padding:2px 4px}.col h4 span{color:#a29d92}
.k{background:#fff;border-radius:12px;padding:14px;border:1px solid #ebe7dd;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.k p{font-size:14.5px;font-weight:500;line-height:1.4;margin:10px 0 12px}
.tag{font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px}
.meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#a29d92}
.ppl{display:flex}.ppl b{width:22px;height:22px;border-radius:50%;border:2px solid #fff;margin-left:-6px}
.bar{height:6px;border-radius:9px;background:#ebe7dd;margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;background:#22a06b}
`, `
<header><div class="lg"><i></i>Tasklane</div><div class="tabs"><span class="on">Board</span><span>List</span><span>Timeline</span><span>Docs</span></div><div class="search">Search tasks…</div><div class="btn">+ New task</div></header>
<div class="wrap"><h1>Launch week</h1><p>14 tasks · 3 due today · updated 2 minutes ago</p>
<div class="cols">
<div class="col"><h4>Backlog <span>4</span></h4>${card('Write the launch announcement post', 'Content', '#7c5cff', 'Fri')}${card('Record a 60-second product demo', 'Video', '#e5484d', 'Mon')}${card('Collect five customer quotes', 'Research', '#2f8fcf', 'Tue')}</div>
<div class="col"><h4>In progress <span>3</span></h4>${card('Design App Store screenshots for v2', 'Design', '#ff6b3d', 'Today')}<div class="k"><span class="tag" style="background:#22a06b1f;color:#22a06b">Engineering</span><p>Ship onboarding checklist</p><div class="meta"><span>◷ Thu</span><span>7/10</span></div><div class="bar"><i style="width:70%"></i></div></div>${card('Pricing page copy review', 'Content', '#7c5cff', 'Thu')}</div>
<div class="col"><h4>Review <span>2</span></h4>${card('Changelog hero image', 'Design', '#ff6b3d', 'Today')}${card('Fix signup email deliverability', 'Engineering', '#22a06b', 'Today')}</div>
<div class="col"><h4>Done <span>5</span></h4>${card('Set up launch-day status page', 'Ops', '#a37b2c', 'Done')}${card('Press kit and logo files', 'Design', '#ff6b3d', 'Done')}${card('Beta feedback survey', 'Research', '#2f8fcf', 'Done')}</div>
</div></div>`);

// ── Orbit: product landing page (1440x900) ───────────────────────────────────
export const landing = page(`
body{background:#0a0b14;color:#f2f3fa;overflow:hidden;position:relative}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;filter:blur(120px);opacity:.55}
nav{position:relative;display:flex;align-items:center;gap:34px;padding:26px 64px;font-size:14.5px;color:#a9adc4}
nav .lg{font-weight:700;font-size:20px;color:#fff;display:flex;gap:10px;align-items:center;margin-right:auto}
nav .lg i{width:26px;height:26px;border-radius:50%;border:5px solid #8b7bff;box-shadow:0 0 0 3px #0a0b14 inset}
nav .cta{color:#0a0b14;background:#fff;padding:10px 18px;border-radius:999px;font-weight:600}
.hero{position:relative;text-align:center;padding:84px 0 0}
.badge{display:inline-flex;gap:8px;align-items:center;padding:7px 14px 7px 8px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:13.5px;color:#cfd2e6}
.badge b{background:#8b7bff;color:#fff;border-radius:999px;padding:2px 9px;font-size:12px}
h1{font-size:76px;line-height:1.02;letter-spacing:-.045em;font-weight:700;margin:26px auto 22px;max-width:900px}
h1 span{background:linear-gradient(90deg,#b4a8ff,#6fe3ff);-webkit-background-clip:text;color:transparent}
.hero p{font-size:19px;color:#a9adc4;max-width:600px;margin:0 auto;line-height:1.55}
.acts{display:flex;gap:12px;justify-content:center;margin-top:34px}
.acts span{padding:15px 26px;border-radius:999px;font-weight:600;font-size:15.5px}
.p{background:linear-gradient(90deg,#8b7bff,#5fb8ff);color:#fff}.g{border:1px solid rgba(255,255,255,.18);color:#fff}
.logos{display:flex;gap:56px;justify-content:center;margin-top:84px;color:#6c7090;font-weight:700;font-size:20px;letter-spacing:-.01em}
`, `<div class="glow" style="background:#5b3cff;left:-300px;top:-420px"></div><div class="glow" style="background:#00b3ff;right:-380px;top:-200px;opacity:.35"></div>
<nav><div class="lg"><i></i>Orbit</div><span>Product</span><span>Pricing</span><span>Customers</span><span>Docs</span><span class="cta">Start free</span></nav>
<section class="hero"><span class="badge"><b>New</b> Orbit 3.0 is here: realtime sync for every team</span>
<h1>Ship releases your team <span>actually</span> agrees on.</h1>
<p>Plan, review, and launch in one calm workspace. Orbit keeps specs, designs, and sign-off in the same place.</p>
<div class="acts"><span class="p">Start for free</span><span class="g">Book a demo</span></div>
<div class="logos"><span>Northbeam</span><span>FIELDNOTE</span><span>paperplane</span><span>Kilnworks</span><span>moss&amp;co</span></div></section>`);

// ── Stride: mobile app screens (390x844) ─────────────────────────────────────
const ring = (pct, color, r) => { const c = 2 * Math.PI * r; return `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${color}22" stroke-width="12"/><circle cx="80" cy="80" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 80 80)"/>`; };
const mobileCss = `
body{background:#0d0f17;color:#f3f4fa;padding:58px 22px 0;width:390px;height:844px;overflow:hidden}
.sb{position:absolute;top:16px;left:30px;right:30px;display:flex;justify-content:space-between;font-size:15px;font-weight:600}
.hi{font-size:14px;color:#8e93ab}h1{font-size:30px;letter-spacing:-.03em;font-weight:700;margin:4px 0 22px}
.card{background:#171a26;border-radius:22px;padding:18px}
.tab{position:absolute;bottom:0;left:0;right:0;height:84px;background:#12141e;border-top:1px solid #20243a;display:flex;justify-content:space-around;padding-top:14px;font-size:11px;color:#6d728d}
.tab b{display:block;width:24px;height:24px;border-radius:8px;border:2px solid currentColor;margin:0 auto 5px}.tab .on{color:#c6ff4a}
`;
export const mobileToday = page(mobileCss + `
.rings{display:flex;gap:16px;align-items:center}
.leg div{font-size:13px;color:#8e93ab;margin-bottom:12px}.leg b{display:block;font-size:20px;color:#fff;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.grid .card .l{font-size:12.5px;color:#8e93ab}.grid .card .v{font-size:24px;font-weight:700;margin-top:6px}
.week{display:flex;justify-content:space-between;align-items:flex-end;height:90px;margin-top:14px}
.week i{width:26px;border-radius:8px;background:#c6ff4a}
.days{display:flex;justify-content:space-between;font-size:11.5px;color:#6d728d;margin-top:8px}.days span{width:26px;text-align:center}
`, `<div class="sb"><span>9:41</span><span>●●● ▮</span></div>
<div class="hi">Thursday, Oct 2</div><h1>Today</h1>
<div class="card rings"><svg width="160" height="160">${ring(0.82, '#c6ff4a', 66)}${ring(0.64, '#5ee2ff', 48)}${ring(0.9, '#ff5ea8', 30)}</svg>
<div class="leg"><div>Move<b>486 / 600 kcal</b></div><div>Exercise<b>32 / 50 min</b></div><div>Stand<b>9 / 10 hrs</b></div></div></div>
<div class="grid"><div class="card"><div class="l">Steps</div><div class="v">8,412</div></div><div class="card"><div class="l">Distance</div><div class="v">6.1 km</div></div></div>
<div class="card" style="margin-top:12px"><div class="l" style="font-size:13px;color:#8e93ab">This week</div>
<div class="week">${[55, 72, 40, 88, 64, 30, 20].map((h, i) => `<i style="height:${h}%;opacity:${i === 3 ? 1 : 0.45}"></i>`).join('')}</div>
<div class="days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div></div>
<div class="tab"><span class="on"><b></b>Today</span><span><b></b>Workouts</span><span><b></b>Plans</span><span><b></b>Profile</span></div>`);

export const mobileWorkout = page(mobileCss + `
.big{font-size:64px;font-weight:700;letter-spacing:-.04em;line-height:1}
.big small{font-size:18px;color:#8e93ab;font-weight:500;letter-spacing:0}
.map{height:250px;border-radius:22px;margin:18px 0 12px;background:#141826;position:relative;overflow:hidden}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stats .card{padding:14px}.stats .l{font-size:11.5px;color:#8e93ab}.stats .v{font-size:19px;font-weight:700;margin-top:4px}
.go{margin-top:14px;height:58px;border-radius:999px;background:#c6ff4a;color:#0d0f17;font-weight:700;font-size:17px;display:grid;place-items:center}
`, `<div class="sb"><span>9:41</span><span>●●● ▮</span></div>
<div class="hi">Morning run · in progress</div><h1>Riverside loop</h1>
<div class="big">5.24<small> km</small></div>
<div class="map"><svg viewBox="0 0 346 250" width="100%" height="100%"><g stroke="#20263a" stroke-width="1">${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 32}" y1="0" x2="${i * 32 - 60}" y2="250"/>`).join('')}${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 32}" x2="346" y2="${i * 32 + 20}"/>`).join('')}</g><path d="M40 200 C 70 120, 120 190, 150 120 S 230 40, 270 90 S 300 190, 250 210" fill="none" stroke="#c6ff4a" stroke-width="5" stroke-linecap="round"/><circle cx="250" cy="210" r="9" fill="#c6ff4a"/><circle cx="250" cy="210" r="18" fill="#c6ff4a" opacity=".25"/></svg></div>
<div class="stats"><div class="card"><div class="l">Pace</div><div class="v">5'12"</div></div><div class="card"><div class="l">Time</div><div class="v">27:18</div></div><div class="card"><div class="l">Heart</div><div class="v">148</div></div></div>
<div class="go">Pause run</div>
<div class="tab"><span><b></b>Today</span><span class="on"><b></b>Workouts</span><span><b></b>Plans</span><span><b></b>Profile</span></div>`);

export const mobilePlans = page(mobileCss + `
.seg{display:flex;background:#171a26;border-radius:14px;padding:4px;margin-bottom:16px}.seg span{flex:1;text-align:center;padding:9px;border-radius:10px;font-size:13.5px;color:#8e93ab;font-weight:500}.seg .on{background:#c6ff4a;color:#0d0f17}
.plan{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.plan .ic{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-weight:700;font-size:18px;color:#0d0f17}
.plan .t{flex:1;font-weight:600;font-size:16px}.plan .t small{display:block;font-weight:400;color:#8e93ab;font-size:12.5px;margin-top:3px}
.plan .p{font-size:12.5px;color:#c6ff4a;font-weight:600}
.feat{height:150px;border-radius:22px;margin-bottom:16px;padding:18px;background:linear-gradient(135deg,#5ee2ff,#7c5cff);color:#0d0f17;display:flex;flex-direction:column;justify-content:flex-end}
.feat b{font-size:22px;letter-spacing:-.02em}.feat span{font-size:13px;font-weight:500;opacity:.8}
`, `<div class="sb"><span>9:41</span><span>●●● ▮</span></div>
<div class="hi">Week 6 of 12</div><h1>Your plans</h1>
<div class="seg"><span class="on">Active</span><span>Explore</span><span>Saved</span></div>
<div class="feat"><span>Featured plan</span><b>Half marathon in 12 weeks</b></div>
${[['Base building', '4 runs · 32 km this week', '68%', '#c6ff4a'], ['Core & mobility', '3 sessions · 20 min each', '45%', '#5ee2ff'], ['Sleep reset', '7 nights · lights out 10:30', '86%', '#ff5ea8']]
  .map(([t, sub, p, c]) => `<div class="card plan"><div class="ic" style="background:${c}">${t[0]}</div><div class="t">${t}<small>${sub}</small></div><div class="p">${p}</div></div>`).join('')}
<div class="tab"><span><b></b>Today</span><span><b></b>Workouts</span><span class="on"><b></b>Plans</span><span><b></b>Profile</span></div>`);
