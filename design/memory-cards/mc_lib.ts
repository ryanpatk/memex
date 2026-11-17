const CUR: string = `<span class="cur"></span>`;
type Card = { k: string; t: string; c: string; sn: string; src?: string; a?: string; h?: number; st?: string; due?: string; pin?: boolean; ag?: boolean; tick?: string; when?: string };

const esc = (s: string): string => s;
const btn = (l: string, k: string = "", st: string = ""): string => `<div class="btn ${k} ${st}">${esc(l)}</div>`;
const rb = (g: string, st: string = "", bd: string = ""): string => `<div class="rb ${st}">${g}${bd ? `<span class="bd">${bd}</span>` : ""}</div>`;
const pill = (n: string, c: string, cnt: string = "", st: string = "", letter: string = ""): string =>
  `<div class="pill ${st}" style="--c:var(--${c})"><b>${letter}</b>${n}${cnt ? ` <em>${cnt}</em>` : ""}</div>`;
const allPill = (on: boolean, cnt: string = "248"): string => `<div class="pill plain ${on ? "on" : ""}">All <em>${cnt}</em></div>`;
const addPill = (): string => `<div class="pill plain add">+ New space</div>`;
const field = (txt: string, v: boolean = false, st: string = "", right: string = ""): string =>
  `<div class="field ${st}"><span class="gl">⌕</span><span class="tx ${v ? "v" : ""}">${txt}</span>${right}</div>`;
const plusBtn = (): string => `<div class="plus">+</div>`;
const meta = (sn: string, extra: string): string => `<div class="meta"><b></b>${sn}${extra ? ` · ${extra}` : ""}</div>`;
const skel = (): string => `<div class="cl"><div class="sk" style="height:22px;width:85%"></div><div class="sk" style="height:22px;width:60%;margin-top:10px"></div><div class="sk" style="height:14px;width:40%;margin-top:18px"></div></div>`;

const card = (d: Card): string => {
  const st = d.st || "";
  const tick = d.tick ? `<div class="tick ${d.tick === "off" ? "off" : ""}">✓</div>` : "";
  const pin = d.pin ? `<div class="pin">★</div>` : "";
  const ag = d.ag ? `<div style="margin-top:12px"><span class="agent">✦ Agent wrote this</span></div>` : "";
  const sty = `style="--c:var(--${d.c})"`;
  const ld = st.indexOf("ld") >= 0;
  const er = st.indexOf("er") >= 0;
  const pic = (h: number, inner: string = ""): string => `<div class="art ${d.a || "g1"}" style="height:${h}px">${er ? `<div class="erb">Picture unavailable</div>` : ""}${inner}</div>`;
  if (d.k === "note") return `<div class="card note ${st}" ${sty}>${tick}${pin}${ld ? skel() : `<div class="nb">${d.t}</div><div class="cl">${meta(d.sn, "note")}${ag}</div>`}</div>`;
  if (d.k === "jot") return `<div class="card jot ${st}" ${sty}>${tick}<div class="jb">${d.t}</div>${meta(d.sn, d.when || "8:14 AM")}${ag}</div>`;
  if (d.k === "task") return `<div class="card task ${st}" ${sty}>${tick}<div class="chk ${d.due === "done" ? "on" : ""}">${d.due === "done" ? "✓" : ""}</div><div><div class="ct">${d.t}</div><div class="meta"><b></b>${d.sn}${d.due && d.due !== "done" ? ` <span class="due ${d.due.indexOf("late") >= 0 ? "late" : ""}">${d.due.replace("late ", "")}</span>` : ""}</div></div></div>`;
  if (d.k === "plain") return `<div class="card ${st}" ${sty}>${tick}${pin}<div class="fav">${(d.src || "w")[0].toUpperCase()}</div>${ld ? skel() : `<div class="cl"><div class="ct">${d.t}</div>${meta(d.sn, d.src || "")}${ag}</div>`}</div>`;
  if (d.k === "img") return `<div class="card img ${st}" ${sty}>${tick}${pin}${pic(d.h || 300, ld ? "" : `<div class="src">${d.src || "pinterest"}</div>`)}${ld ? "" : `<div class="cl"><div class="ct" style="font-size:20px">${d.t}</div>${meta(d.sn, "")}</div>`}</div>`;
  return `<div class="card ${st}" ${sty}>${tick}${pin}${pic(d.h || 220)}${ld ? skel() : `<div class="cl"><div class="ct">${d.t}</div>${meta(d.sn, er ? "couldn’t refresh preview" : d.src || "")}${ag}</div>`}</div>`;
};

const S: Record<string, Card> = {
  oak: { k: "img", t: "Warm oak open shelving over a zellige backsplash", c: "coral", sn: "Kitchen reno", src: "pinterest", a: "g1", h: 300 },
  join: { k: "link", t: "Japanese joinery holds a house together without nails", c: "gold", sn: "Reading", src: "youtube.com", a: "g4", h: 200 },
  calm: { k: "plain", t: "Calm Technology: principles for tools that respect attention", c: "gold", sn: "Reading", src: "calmtech.com" },
  lime: { k: "note", t: "Lime plaster, not paint, for the hallway. Ask about curing time.", c: "coral", sn: "Kitchen reno" },
  bamboo: { k: "link", t: "Arashiyama bamboo grove at 7am, before the crowds", c: "cyan", sn: "Kyoto trip", src: "kyoto.travel", a: "g3", h: 230 },
  type: { k: "plain", t: "A tiny type scale that holds up at every size", c: "blue", sn: "Studio", src: "x.com" },
  brass: { k: "jot", t: "Brass pulls, not black.", c: "coral", sn: "Kitchen reno" },
  tile: { k: "task", t: "Order three tile samples", c: "coral", sn: "Kitchen reno", due: "Nov 18" },
  moss: { k: "img", t: "Moss garden at Saiho-ji", c: "cyan", sn: "Kyoto trip", src: "pinterest", a: "g3", h: 260 },
  read: { k: "link", t: "How to plan a reading year", c: "gold", sn: "Reading", src: "example-books.com", a: "g5", h: 180 },
  ryo: { k: "note", t: "Ryokan shortlist: two near the river, one in the hills.", c: "cyan", sn: "Kyoto trip" },
  work: { k: "img", t: "Pale worktop samples", c: "coral", sn: "Kitchen reno", src: "pinterest", a: "g2", h: 220 },
};
const W = (k: string, o: Partial<Card> = {}): Card => Object.assign({}, S[k], o);
const grid = (cols: Card[][]): string => `<div class="grid">${cols.map((c: Card[]) => `<div class="col">${c.map(card).join("")}</div>`).join("")}</div>`;
const LIB: Card[][] = [[W("oak"), W("type")], [W("lime"), W("bamboo")], [W("join"), W("tile"), W("calm")]];

const topbar = (act: string, inbox: string = "5"): string =>
  `<div class="top"><div class="wm">memex</div><div class="seg">${["Journal", "Cards", "Tasks"].map((x: string) => `<span class="${x === act ? "on" : ""}">${x}</span>`).join("")}</div><div class="row" style="gap:12px"><div class="btn sm" style="position:relative">Inbox${inbox ? ` <span class="kb" style="background:var(--coral);color:#fff;box-shadow:none">${inbox}</span>` : ""}</div>${rb("D")}</div></div>`;
const hrow = (title: string, sub: string, fld: string = ""): string =>
  `<div class="hrow"><div class="hero">${title}<small>${sub}</small></div><div class="row" style="gap:12px;flex-wrap:nowrap">${fld || `<div style="width:580px">${field("Search or save a link, a thought…", false, "", plusBtn())}</div>`}${rb("•••")}</div></div>`;
const SP: [string, string, string][] = [["Kitchen reno", "coral", "38"], ["Kyoto trip", "cyan", "24"], ["Reading", "gold", "57"], ["Studio", "blue", "19"]];
const pills = (act: string = "All", extra: string = ""): string =>
  `<div class="pills">${allPill(act === "All")}${SP.map((s: [string, string, string]) => pill(s[0], s[1], s[2], s[0] === act ? "sel" : "")).join("")}${addPill()}${extra}</div>`;
const desk = (inner: string, cls: string = "", act: string = "Cards", inbox: string = "5"): string => `<div class="frame ${cls}">${topbar(act, inbox)}${inner}</div>`;
const phone = (inner: string, tab: string = "", plusSt: string = ""): string =>
  `<div class="phone"><div class="sb">9:41<i></i>●●●</div>${inner}${tab ? tabs(tab, plusSt) : ""}</div>`;
const tabs = (act: string, plusSt: string = ""): string =>
  `<div class="tabs">${["Journal", "Cards", "+", "Spaces", "Inbox"].map((x: string) => x === "+" ? `<div class="plus big ${plusSt}">+</div>` : `<span class="${x === act ? "on" : ""}"><i></i>${x}${x === "Inbox" ? `<em class="bd" style="position:absolute;right:8px;top:-8px;min-width:22px;height:22px;border-radius:11px;background:var(--coral);color:#fff;font:800 13px/22px var(--fu);font-style:normal;text-align:center">5</em>` : ""}</span>`).join("")}</div>`;
const mf = (a: string, b: string, cls: string = ""): string => `<div class="frame m ${cls}">${a}${b}</div>`;
const mhead = (t: string, right: string = ""): string => `<div class="ph" style="display:flex;justify-content:space-between;align-items:center;padding-top:6px"><div class="hero">${t}</div><div class="row" style="gap:10px">${right}</div></div>`;
const menu = (items: string[], sty: string = ""): string => `<div class="menu ${sty ? "" : "static"}" style="${sty}">${items.map((i: string) => {
  if (i === "-") return `<div class="msep"></div>`;
  if (i.indexOf("#") === 0) return `<div class="mhd">${i.slice(1)}</div>`;
  const p = i.split("|");
  return `<div class="mi ${p[3] || ""}"><i>${p[0]}</i>${p[1]}${p[2] ? `<small>${p[2]}</small>` : ""}</div>`;
}).join("")}</div>`;
const toast = (t: string, a: string = "", cls: string = "", c: string = "ok", g: string = "✓"): string => `<div class="toast ${cls}" style="--c:var(--${c})"><b>${g}</b>${t}${a ? `<span class="ta">${a}</span>` : ""}</div>`;
const empty = (t: string, b: string, act: string = "", c: string = "line"): string => `<div class="empty" style="--c:var(--${c})"><div class="eg"></div><div class="h2">${t}</div><div class="body">${b}</div>${act}</div>`;
const sheet = (sty: string, inner: string, x: boolean = true): string => `<div class="sheet" style="${sty}">${inner}${x ? `<div class="x">${rb("✕")}</div>` : ""}</div>`;
const inp = (v: string, st: string = ""): string => `<div class="inp ${st}">${v}</div>`;
const trow = (t: string, c: string, due: string = "", st: string = "", sn: string = ""): string =>
  `<div class="trow ${st}" style="--c:var(--${c})"><div class="chk ${st.indexOf("done") >= 0 ? "on" : ""}">${st.indexOf("done") >= 0 ? "✓" : ""}</div><div class="tt">${t}</div>${sn ? `<span class="strip"><b></b>${sn}</span>` : ""}${due ? `<span class="due ${due.indexOf("late") >= 0 ? "late" : ""}">${due.replace("late ", "")}</span>` : ""}</div>`;
const lrow = (d: Card, st: string = ""): string => `<div class="lrow ${st}" style="--c:var(--${d.c})">${d.a && d.k !== "note" ? `<div class="art ${d.a}"></div>` : `<div class="fav">${d.k === "note" ? "✎" : (d.src || "w")[0].toUpperCase()}</div>`}<div class="tt">${d.t}<div class="meta" style="margin-top:6px"><b></b>${d.sn}${d.src ? " · " + d.src : ""}</div></div><span class="lab">2h</span></div>`;
const bub = (t: string, tm: string, strip: string = ""): string => `<div class="jrow"><div class="bub">${t}<small>${tm}</small></div>${strip}</div>`;
const strip = (n: string, c: string, sug: boolean = false): string => `<span class="strip ${sug ? "sug" : ""}" style="--c:var(--${c})"><b></b>${sug ? n + "?" : n}</span>`;
const lbl = (t: string): string => `<div class="lbl">${t}</div>`;
const cell = (inner: string, l: string): string => `<div class="cell">${inner}${lbl(l)}</div>`;
const shead = (t: string, sub: string): string => `<div style="margin-bottom:36px"><div class="h1">${t}</div><div class="body" style="color:var(--mut);margin-top:8px">${sub}</div></div>`;
const sframe = (inner: string): string => `<div class="frame" style="padding:48px 64px">${inner}</div>`;
const proposal = (): string => `<div class="card" style="padding:28px;--c:var(--vio)"><div class="row" style="justify-content:space-between"><span class="agent">✦ Research agent</span><span class="lab">wants to edit a note · 10 min ago</span></div><div class="h3" style="margin-top:16px">Ryokan shortlist</div><div class="diff" style="margin-top:14px">Two near the river, <span class="del">one in the hills</span> <span class="ins">one in the hills with an onsen</span>.</div><div class="body" style="color:var(--mut);margin-top:12px;font-size:17px">Reason: you saved two onsen links this week.</div><div class="row" style="margin-top:20px;margin-bottom:10px">${btn("Approve", "p sm")}${btn("Reject", "sm")}</div></div>`;
const suggestion = (): string => `<div class="card" style="padding:24px 24px 34px;--c:var(--cyan)"><div class="row" style="flex-wrap:nowrap;gap:18px"><div class="art g3" style="width:96px;height:72px;border-radius:16px;flex:none"></div><div style="flex:1"><div class="h3" style="font-size:21px">Moss garden at Saiho-ji</div><div class="lab" style="margin-top:4px">Mentions “Kyoto” · saved from Pinterest</div></div></div><div class="row" style="margin-top:18px">${pill("File in Kyoto trip", "cyan", "", "sm")}${btn("Not now", "q sm")}</div></div>`;
