const CUR: string = `<span class="cur"></span>`;
type Card = { k: string; t: string; c: string; sn: string; src?: string; a?: string; h?: number; st?: string; due?: string; pin?: boolean; ag?: boolean; tick?: string; when?: string; more?: string };

const esc = (s: string): string => s;
const btn = (l: string, k: string = "", st: string = ""): string => `<div class="btn ${k} ${st}">${esc(l)}</div>`;
const rb = (g: string, st: string = "", bd: string = ""): string => `<div class="rb ${st}">${g}${bd ? `<span class="bd">${bd}</span>` : ""}</div>`;
const pill = (n: string, c: string, cnt: string = "", st: string = "", letter: string = ""): string =>
  `<div class="pill ${st}" style="--c:var(--${c})"><b>${letter}</b>${n}${cnt ? ` <em>${cnt}</em>` : ""}</div>`;
const allPill = (on: boolean, cnt: string = ""): string => `<div class="pill plain ${on ? "on" : ""}">All${cnt ? ` <em>${cnt}</em>` : ""}</div>`;
// "New space" is an empty cartridge slot at the end of the pill row.
const addPill = (): string => `<div class="pill plain add" style="width:60px;padding:0;justify-content:center;border:3px dashed var(--line);box-shadow:none;font-size:26px">+</div>`;
const addPillText = (): string => `<div class="pill plain add">+ New space</div>`;
const field = (txt: string, v: boolean = false, st: string = "", right: string = ""): string =>
  `<div class="field ${st}"><span class="gl">⌕</span><span class="tx ${v ? "v" : ""}">${txt}</span>${right}</div>`;
const plusBtn = (): string => `<div class="plus">+</div>`;
const skel = (): string => `<div class="cl"><div class="sk" style="height:24px;width:85%"></div><div class="sk" style="height:24px;width:60%;margin-top:12px"></div></div>`;
const TYPEWORD: Record<string, string> = { note: "note", jot: "jot", task: "task" };
// The label strip: the space's name on its own colour, with the source or kind on the right.
const label = (d: Card, right: string = ""): string => {
  const r = right || d.src || TYPEWORD[d.k] || "";
  const ld = (d.st || "").indexOf("ld") >= 0;
  if (ld) return `<div class="lb"></div>`;
  return `<div class="lb ${d.sn ? "" : "none"}"><span>${d.sn || "Unfiled"}${d.more ? ` +${d.more}` : ""}</span>${r ? `<i>${r}</i>` : ""}</div>`;
};
const agentBadge = (): string => `<div style="margin-top:12px"><span class="agent">✦ Agent wrote this</span></div>`;

const card = (d: Card): string => {
  const st = d.st || "";
  const tick = d.tick ? `<div class="tick ${d.tick === "off" ? "off" : ""}">✓</div>` : "";
  const pin = d.pin ? `<div class="pin">★</div>` : "";
  const ag = d.ag ? agentBadge() : "";
  const sty = `style="--c:var(--${d.c || "line"})"`;
  const ld = st.indexOf("ld") >= 0;
  const er = st.indexOf("er") >= 0;
  const pic = (h: number): string => `<div class="art ${d.a || "g1"}" style="height:${h}px">${er ? `<div class="erb">Picture unavailable</div>` : ""}</div>`;
  if (d.k === "note") return `<div class="card note ${st}" ${sty}>${tick}${pin}${ld ? skel() : `<div class="nb">${d.t}${ag}</div>`}${label(d)}</div>`;
  if (d.k === "jot") return `<div class="card jot ${st}" ${sty}>${tick}<div class="jb">${d.t}${ag}</div>${label(d, d.when || "8:14 AM")}</div>`;
  if (d.k === "task") return `<div class="card task ${st}" ${sty}>${tick}<div class="tb"><div class="chk lg ${d.due === "done" ? "on" : ""}">${d.due === "done" ? "✓" : ""}</div><div><div class="ct">${d.t}</div>${d.due && d.due !== "done" ? `<div style="margin-top:12px"><span class="due ${d.due.indexOf("late") >= 0 ? "late" : d.due === "Today" ? "today" : ""}">${d.due.replace("late ", "")}</span></div>` : ""}</div></div>${label(d)}</div>`;
  if (d.k === "plain") return `<div class="card plainc ${st}" ${sty}>${tick}${pin}<div class="fav">${(d.src || "w")[0].toUpperCase()}</div>${ld ? skel() : `<div class="cl"><div class="ct">${d.t}</div>${ag}</div>`}${label(d)}</div>`;
  return `<div class="card ${d.k === "img" ? "img" : ""} ${st}" ${sty}>${tick}${pin}${pic(d.h || 220)}${ld ? skel() : `<div class="cl"><div class="ct">${d.t}</div>${ag}</div>`}${label(d, er ? "preview failed" : "")}</div>`;
};

const S: Record<string, Card> = {
  oak: { k: "img", t: "Warm oak shelving over a zellige backsplash", c: "coral", sn: "Kitchen reno", src: "pinterest", a: "g1", h: 280 },
  join: { k: "link", t: "Japanese joinery holds a house together without nails", c: "gold", sn: "Reading", src: "youtube.com", a: "g4", h: 196 },
  calm: { k: "plain", t: "Calm Technology: tools that respect attention", c: "gold", sn: "Reading", src: "calmtech.com" },
  lime: { k: "note", t: "Lime plaster, not paint, for the hallway. Ask about curing time.", c: "coral", sn: "Kitchen reno" },
  bamboo: { k: "link", t: "Arashiyama bamboo grove at 7am, before the crowds", c: "cyan", sn: "Kyoto trip", src: "kyoto.travel", a: "g3", h: 220 },
  type: { k: "plain", t: "A tiny type scale that holds up at every size", c: "blue", sn: "Studio", src: "x.com" },
  brass: { k: "jot", t: "Brass pulls, not black.", c: "coral", sn: "Kitchen reno" },
  tile: { k: "task", t: "Order three tile samples", c: "coral", sn: "Kitchen reno", due: "Nov 18" },
  moss: { k: "img", t: "Moss garden at Saiho-ji", c: "cyan", sn: "Kyoto trip", src: "pinterest", a: "g3", h: 260 },
  read: { k: "link", t: "How to plan a reading year", c: "gold", sn: "Reading", src: "example-books.com", a: "g5", h: 180 },
  ryo: { k: "note", t: "Ryokan shortlist: two near the river, one in the hills.", c: "cyan", sn: "Kyoto trip" },
  work: { k: "img", t: "Pale worktop samples", c: "coral", sn: "Kitchen reno", src: "pinterest", a: "g2", h: 220 },
  lamp: { k: "img", t: "Reading lamp with a linen shade", c: "line", sn: "", src: "pinterest", a: "g6", h: 200 },
  rail: { k: "jot", t: "7-day rail pass covers the Nara day trip.", c: "cyan", sn: "Kyoto trip", when: "Nov 9" },
};
const W = (k: string, o: Partial<Card> = {}): Card => Object.assign({}, S[k], o);
const grid = (cols: Card[][], sty: string = ""): string => `<div class="grid" style="${sty}">${cols.map((c: Card[]) => `<div class="col">${c.map(card).join("")}</div>`).join("")}</div>`;
const LIB: Card[][] = [[W("oak"), W("type")], [W("brass"), W("bamboo")], [W("join"), W("tile"), W("lime")]];

const inboxBtn = (n: string): string => `<div class="btn sm" style="position:relative">Inbox${n ? `<span class="bdg">${n}</span>` : ""}</div>`;
const topbar = (act: string, inbox: string = "5"): string =>
  `<div class="top"><div class="wm">memex</div><div class="seg">${["Journal", "Cards", "Tasks"].map((x: string) => `<span class="${x === act ? "on" : ""}">${x}</span>`).join("")}</div><div class="row" style="gap:16px;flex-wrap:nowrap">${inboxBtn(inbox)}${rb("D")}</div></div>`;
const heroT = (title: string, cnt: string = ""): string => `<div class="hero">${title}${cnt ? `<sup>${cnt}</sup>` : ""}</div>`;
const hrow = (title: string, cnt: string, fld: string = "", right: string = ""): string =>
  `<div class="hrow">${heroT(title, cnt)}<div class="row" style="gap:12px;flex-wrap:nowrap">${fld || `<div style="width:560px">${field("Search or save a link, a thought…", false, "", plusBtn())}</div>`}${right || rb("•••")}</div></div>`;
const SP: [string, string, string][] = [["Kitchen reno", "coral", "38"], ["Kyoto trip", "cyan", "24"], ["Reading", "gold", "57"], ["Studio", "blue", "19"]];
const pills = (act: string = "All", extra: string = ""): string =>
  `<div class="pills">${allPill(act === "All")}${SP.map((s: [string, string, string]) => pill(s[0], s[1], "", s[0] === act ? "sel" : "")).join("")}${extra}${addPill()}</div>`;
const desk = (inner: string, cls: string = "", act: string = "Cards", inbox: string = "5"): string => `<div class="frame ${cls}">${topbar(act, inbox)}${inner}</div>`;
const phone = (inner: string, tab: string = "", plusSt: string = "", three: boolean = false): string =>
  `<div class="phone"><div class="sb">9:41<i></i>●●●</div>${inner}${tab ? (three ? tabs3(tab) : tabs(tab, plusSt)) : ""}</div>`;
const tabs = (act: string, plusSt: string = "", st: string = ""): string =>
  `<div class="tabs">${["Journal", "Cards", "+", "Spaces", "Inbox"].map((x: string) => x === "+" ? `<div class="plus big ${plusSt}">+</div>` : `<span class="${x === act ? "on" : ""} ${x === act ? st : ""}"><i></i>${x}${x === "Inbox" ? `<em class="tbd">5</em>` : ""}</span>`).join("")}</div>`;
const tabs3 = (act: string): string =>
  `<div class="tabs">${["Journal", "Cards", "Spaces"].map((x: string) => `<span class="${x === act ? "on" : ""}" style="width:96px"><i></i>${x}</span>`).join("")}</div>`;
const mf = (a: string, b: string, cls: string = ""): string => `<div class="frame m ${cls}">${a}${b}</div>`;
const mhead = (t: string, right: string = "", cnt: string = ""): string => `<div class="ph" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px"><div class="hero">${t}${cnt ? `<sup>${cnt}</sup>` : ""}</div><div class="row" style="gap:8px;flex-wrap:nowrap">${right}</div></div>`;
// Menu items: "glyph|label|right|state". A glyph of "@coral" draws that space's dot.
const menu = (items: string[], sty: string = ""): string => `<div class="menu ${sty ? "" : "static"}" style="${sty}">${items.map((i: string) => {
  if (i === "-") return `<div class="msep"></div>`;
  if (i.indexOf("#") === 0) return `<div class="mhd">${i.slice(1)}</div>`;
  const p = i.split("|");
  const g = p[0].indexOf("@") === 0 ? `<i class="dot" style="--c:var(--${p[0].slice(1)})"></i>` : `<i>${p[0]}</i>`;
  return `<div class="mi ${p[3] || ""}">${g}${p[1]}${p[2] ? `<small>${p[2]}</small>` : ""}</div>`;
}).join("")}</div>`;
const toast = (t: string, a: string = "", cls: string = "", c: string = "ok", g: string = "✓"): string => `<div class="toast ${cls}" style="--c:var(--${c})"><b>${g}</b>${t}${a ? `<span class="ta">${a}</span>` : ""}</div>`;
const empty = (t: string, b: string, act: string = "", c: string = "line", glyph: string = "+"): string => `<div class="empty" style="--c:var(--${c})"><div class="slot"><span>${glyph}</span></div><div class="h2">${t}</div>${b ? `<div class="body">${b}</div>` : ""}${act}</div>`;
const sheet = (sty: string, inner: string, x: boolean = true): string => `<div class="sheet" style="${sty}">${inner}${x ? `<div class="x">${rb("✕")}</div>` : ""}</div>`;
const inp = (v: string, st: string = ""): string => `<div class="inp ${st}">${v}</div>`;
const trow = (t: string, c: string, due: string = "", st: string = "", sn: string = ""): string =>
  `<div class="trow ${st}" style="--c:var(--${c})"><div class="chk ${st.indexOf("done") >= 0 ? "on" : ""}">${st.indexOf("done") >= 0 ? "✓" : ""}</div><div class="tt">${t}</div>${sn ? strip(sn, c) : ""}${due ? `<span class="due ${due.indexOf("late") >= 0 ? "late" : due === "Today" ? "today" : ""}">${due.replace("late ", "")}</span>` : ""}</div>`;
const lrow = (d: Card, st: string = "", when: string = "2h"): string => `<div class="lrow ${st}" style="--c:var(--${d.c})">${d.a && d.k !== "note" && d.k !== "jot" ? `<div class="art ${d.a}"></div>` : `<div class="fav" style="${d.k === "note" || d.k === "jot" ? "background:color-mix(in srgb,var(--c) 30%,var(--paper));color:var(--ink)" : ""}">${d.k === "note" ? "✎" : d.k === "jot" ? "“" : (d.src || "w")[0].toUpperCase()}</div>`}<div class="tt">${d.t}</div>${strip(d.sn, d.c)}<span class="lab" style="width:48px;text-align:right">${when}</span></div>`;
const bub = (t: string, tm: string, strp: string = ""): string => `<div class="jrow"><div class="bub">${t}<small>${tm}</small></div>${strp}</div>`;
const strip = (n: string, c: string, sug: boolean = false): string => `<span class="strip ${sug ? "sug" : ""}" style="--c:var(--${c})"><b></b>${sug ? "File in " + n + "?" : n}</span>`;
const lbl = (t: string): string => `<div class="lbl">${t}</div>`;
const cell = (inner: string, l: string): string => `<div class="cell">${inner}${lbl(l)}</div>`;
const shead = (t: string, sub: string): string => `<div style="margin-bottom:32px"><div class="h1">${t}</div><div class="body" style="color:var(--mut);margin-top:8px">${sub}</div></div>`;
const sframe = (inner: string): string => `<div class="frame" style="padding:48px 64px">${inner}</div>`;
const xtag = (id: string, t: string): string => `<div class="xtag"><b>${id}</b>${t}</div>`;
const proposal = (compact: boolean = false): string => `<div class="card" style="padding:${compact ? "20px 20px 0" : "28px 28px 0"};--c:var(--cyan)"><div class="row" style="gap:12px"><span class="agent">✦ Research agent</span><span class="lab">wants to edit · 10 min</span></div><div class="h3" style="margin-top:16px">Ryokan shortlist</div><div class="diff" style="margin-top:16px${compact ? ";font-size:18px;padding:12px 16px" : ""}">Two near the river, one in the hills <span class="ins">with an onsen</span>.</div><div class="lab" style="margin-top:12px">Because you saved two onsen links this week.</div><div class="row" style="margin:24px 0 24px;gap:12px;flex-wrap:nowrap">${btn("Approve", `p ${compact ? "sm" : ""}`)}${btn("Reject", `q ${compact ? "sm" : ""}`)}</div><div class="lb" style="margin:0 ${compact ? "-20px" : "-28px"}"><span>Kyoto trip</span><i>note</i></div></div>`;
const suggestion = (t: string = "Moss garden at Saiho-ji", why: string = "Mentions “Kyoto”", sn: string = "Kyoto trip", c: string = "cyan", g: string = "g3", compact: boolean = false): string => `<div class="card" style="padding:${compact ? "16px 16px 0" : "20px 20px 0"}"><div class="row" style="flex-wrap:nowrap;gap:16px"><div class="art ${g}" style="width:${compact ? 88 : 112}px;height:${compact ? 72 : 88}px;border-radius:16px;flex:none"></div><div style="flex:1;min-width:0"><div class="h3" style="font-size:${compact ? 21 : 24}px">${t}</div><div class="lab" style="margin-top:4px">${why}</div></div></div><div class="row" style="margin:20px 0 20px;gap:8px;flex-wrap:nowrap">${pill("File in " + sn, c, "", `sel ${compact ? "xs" : "sm"}`, "✓")}${btn("Not now", `q ${compact ? "sm" : "sm"}`)}</div><div class="lb none" style="margin:0 ${compact ? "-16px" : "-20px"}"><span>Unfiled</span><i>pinterest</i></div></div>`;