type Item = { id: string; g: string; l: string; html: string; cls?: string; w?: number };
const ST = ["", "hov", "prs", "foc", "load", "err", "dis"];
const STL = ["Default", "Hover", "Pressed", "Focus", "Loading", "Error", "Disabled"];
const stateCols = (f: (s: string) => string, n: number = 7): string => `<div class="cs" style="grid-template-columns:repeat(${n},1fr);margin-bottom:24px">${ST.slice(0, n).map((s: string, i: number) => cell(f(s), STL[i])).join("")}</div>`;
const ITEMS: Item[] = [];
const add = (id: string, g: string, l: string, html: string, cls: string = "", w: number = 1440): void => { ITEMS.push({ id, g, l, html, cls, w }); };
const COLS = ["coral", "cyan", "gold", "blue", "vio", "green", "orange", "pink"];

add("s01", "Components", "Tokens", sframe(shead("Tokens", "One scale for web and phone. The font is one switch: Nunito + Inter by default, IBM Plex with the plex class.") + `
<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:64px">
<div><div class="sec" style="margin-bottom:16px">Type: hero is 4.4× body</div>
<div class="hero">Everything<sup>248</sup></div><div class="lab" style="margin:4px 0 12px">hero 80 (phone 52), count as a superscript</div><div class="h1">Kitchen reno <span class="lab">h1 44</span></div><div class="h2" style="margin-top:12px">Save something <span class="lab">h2 32</span></div><div class="h3" style="margin-top:12px">Card title, every card <span class="lab">h3 26</span></div><div class="body" style="margin-top:12px">Body copy sits at 18. <span class="lab">body 18</span></div><div class="lab" style="margin-top:12px">Labels, meta, captions: the floor is 16</div>
<div class="sec" style="margin:32px 0 16px">Label strip and space colours (ink on every fill)</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">${COLS.map((c: string, i: number) => `<div class="lb" style="--c:var(--${c});margin:0;border-radius:14px;padding:0 16px">${["Kitchen reno", "Kyoto trip", "Reading", "Studio", "Garden", "Recipes", "Bikes", "Music"][i]}</div>`).join("")}</div>
<div class="sec" style="margin:32px 0 12px">Font switch</div><div class="row" style="gap:48px;align-items:flex-end"><div><div class="h2">Memory card</div><div class="lab">Nunito 900 + Inter</div></div><div class="mc plex" style="background:transparent"><div class="h2">Memory card</div><div class="lab">IBM Plex Sans 700</div></div></div></div>
<div><div class="sec" style="margin-bottom:16px">Spacing</div><div class="row" style="align-items:flex-end;gap:12px">${[4, 8, 12, 16, 24, 32, 40, 48, 64].map((n: number) => `<div class="cell"><div style="width:${n}px;height:${n}px;background:var(--pri);border-radius:4px"></div>${lbl(String(n))}</div>`).join("")}</div>
<div class="sec" style="margin:32px 0 16px">Radii (picture 16 sits concentric in card 28 at a 12 inset)</div><div class="row" style="gap:16px">${[["12", "chip"], ["16", "picture"], ["28", "card"], ["40", "sheet"], ["999", "pill"]].map((r: string[]) => `<div class="cell"><div style="width:72px;height:72px;background:var(--paper);box-shadow:var(--sh1);border-radius:${r[0] === "999" ? "36" : r[0]}px"></div>${lbl(r[0] + " " + r[1])}</div>`).join("")}</div>
<div class="sec" style="margin:32px 0 16px">System</div><div class="row" style="gap:8px;flex-wrap:nowrap">${["ink", "mut", "line", "bg", "paper", "pri", "ring", "ok", "err", "agent"].map((c: string) => `<div class="cell"><div class="sw" style="--c:var(--${c});width:44px;height:44px;box-shadow:0 0 0 2px var(--line) inset"></div>${lbl(c)}</div>`).join("")}</div>
<div class="sec" style="margin:32px 0 12px">Targets and motion</div><div class="body">Controls 60, small 48, never under 44. Press 120 ms · hover and sheets 200 ms · card write 280 ms · ease (.2,.8,.2,1) · reduced motion: fades only, no lift.</div>
</div></div>`));

add("s02", "Components", "Buttons", sframe(shead("Buttons", "Four kinds, two sizes, seven states. Primary is molded: a darker lip at the bottom that flattens when pressed.") +
  stateCols((s: string) => btn("Save", "p", s)) + stateCols((s: string) => btn("Move", "", s)) + stateCols((s: string) => btn("Delete", "d", s)) + stateCols((s: string) => btn("Not now", "q", s)) +
  `<div class="sec" style="margin:8px 0 16px">Round icon buttons (56, small 44)</div>` + stateCols((s: string) => `<div class="row" style="gap:12px">${rb("•••", s)}${rb("✕", s + " sm")}</div>`)));

add("s03", "Components", "Space pills", sframe(shead("Space pills", "A space is a coloured cartridge. Pills filter, file and take drops. The chosen one fills with its colour.") +
  stateCols((s: string) => pill("Kitchen reno", "coral", "", s + " sm")) +
  `<div class="cs" style="grid-template-columns:repeat(4,1fr);margin-top:24px">${cell(allPill(true), "All, active")}${cell(pill("Kyoto trip", "cyan", "", "sel"), "Filtering this space (selected)")}${cell(pill("Add 3 to Reading", "gold", "", "drop", "+"), "Drop target while dragging")}${cell(pill("Studio", "blue", "All in", ""), "Already holds the selection")}${cell(addPill(), "New space: an empty slot")}${cell(pill("Kitchen reno", "coral", "", "xs"), "Small (44), in rows and sheets")}${cell(`<div class="pill plain">More <em>6</em></div>`, "Overflow past 6 spaces")}${cell(strip("Kitchen reno", "coral") + `<div style="height:12px"></div>` + strip("Kyoto trip", "cyan", true), "Strip, and a filing suggestion")}</div>`));

add("s04", "Components", "Save / search field", sframe(shead("Save and search field", "One field. Typing searches as you go; Enter saves what you typed. A lone link saves a link card, [] a task, ⌘↵ a note, @ files it.") +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px 40px">
${cell(`<div style="width:600px">${field("Search or save a link, a thought…", false, "", plusBtn())}</div>`, "Default")}
${cell(`<div style="width:600px">${field("Search or save a link, a thought…", false, "hov", plusBtn())}</div>`, "Hover")}
${cell(`<div style="width:600px">${field("plaster" + CUR, true, "foc", `<span class="lab" style="margin-right:16px">3 cards · ↵ saves a jot</span>`)}</div>`, "Focus, typing: searching")}
${cell(`<div style="width:600px">${field("https://example-design.com/lime-plaster", true, "foc", `<span class="kb">Link</span>${plusBtn()}`)}</div>`, "A link was pasted")}
${cell(`<div style="width:600px">${field("Fetching the preview…", false, "foc", `<div class="btn p load" style="width:60px;height:60px;padding:0"></div>`)}</div>`, "Loading")}
${cell(`<div style="width:600px">${field("Couldn’t save. It’s kept here.", true, "err", btn("Retry", "sm"))}</div>`, "Error, nothing lost")}
${cell(`<div style="width:600px;position:relative">${field("Buy brass pulls @kit" + CUR, true, "foc", "")}${menu(["#File it in", "@coral|Kitchen reno||hov", "@cyan|Kyoto trip"], "left:300px;top:84px;width:300px")}</div>`, "@ picks a space")}
${cell(`<div style="width:600px">${field("Search or save a link, a thought…", false, "dis", plusBtn())}</div>`, "Disabled (signed out)")}
</div>`));

add("s05", "Components", "Cards: variants", sframe(shead("Memory cards", "One body: a 28 px card, a 16 px inset picture, a 26 px title and a label strip that names the space. Text-only cards wear their space’s colour.") +
  `<div class="cs" style="grid-template-columns:repeat(4,1fr);align-items:start">
${cell(card(W("join", { h: 150 })), "Link with picture")}${cell(card(W("oak", { h: 190 })), "Picture save")}${cell(card(W("calm")), "Link without picture")}${cell(card(W("lamp", { h: 130 })), "Not in a space yet")}
</div><div class="cs" style="grid-template-columns:repeat(4,1fr);align-items:start;margin-top:24px">${cell(card(W("lime")), "Note: tinted")}${cell(card(W("brass")), "Jot: full colour")}${cell(card(W("tile")), "Task")}${cell(card(W("read", { h: 100, sn: "Reading", more: "1" })), "In two spaces")}</div>`));

add("s06", "Components", "Cards: states", sframe(shead("Card states", "Hover lifts 4 px. Press settles. Saving writes the card: see s14.") +
  `<div class="cs" style="grid-template-columns:repeat(5,1fr);align-items:start">
${["", "hov", "prs", "foc", "ld"].map((s: string, i: number) => cell(card(W("bamboo", { h: 96, t: "Arashiyama at 7am", st: s })), ["Default", "Hover", "Pressed", "Focus", "Loading"][i])).join("")}
${cell(card(W("bamboo", { h: 96, t: "Arashiyama at 7am", st: "er" })), "Error: preview failed")}${cell(card(W("bamboo", { h: 96, t: "Arashiyama at 7am", st: "selc", tick: "on" })), "Selected")}${cell(card(W("bamboo", { h: 96, t: "Arashiyama at 7am", st: "drag" })), "Dragging")}${cell(card(W("bamboo", { h: 96, t: "Arashiyama at 7am", st: "write" })), "Just saved")}${cell(card(W("ryo", { t: "Ryokan shortlist", pin: true, ag: true })), "Pinned, agent-written")}
</div>`));

add("s07", "Components", "Menus and sheets", sframe(shead("••• menu and sheets", "Everything that isn’t on screen lives in one ••• menu. Sheets hold one job each.") +
  `<div style="display:flex;gap:40px;align-items:flex-start">
${cell(menu(["↗|Open||", "⧉|Copy link||hov", "✎|Edit…||foc", "★|Pin to top||prs", "↻|Refresh preview||load", "#|Show tags||dis", "-", "✕|Delete|⌫|dz"].map((x: string) => x.replace("#|Show tags||dis", "|Show tags||dis"))), "Hover, focus, pressed, disabled, danger")}
<div style="width:560px">${cell(`<div class="sheet static" style="width:560px;padding:40px"><div class="h2">Delete this card?</div><div class="body" style="color:var(--mut);margin-top:12px">You can undo for 6 seconds.</div><div class="sf">${btn("Cancel", "q")}${btn("Delete", "d")}</div></div>`, "Confirm sheet")}
<div style="height:24px"></div>${cell(`<div class="sheet static" style="width:560px;padding:40px"><div class="h2">New space</div><div class="flab">Name</div>${inp("", "foc err")}<div class="ferr">A space needs a name.</div><div class="sf">${btn("Cancel", "q")}${btn("Create", "p load")}</div></div>`, "Sheet with an error, then loading")}</div>
${cell(menu(["#Layout", "▦|Cards|✓|on", "☰|List", "▤|Table", "-", "|View options…"]), "Short ••• menu (d06)")}
</div>`));

add("s08", "Components", "Toasts and states", sframe(shead("Toasts, empty, loading and error", "Every change toasts, most with Undo. An empty state is an empty card slot and one action.") +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;justify-items:start">${toast("Saved to Kitchen reno", "Open", "", "coral", "✓")}${toast("Moved 3 cards to Reading", "Undo", "", "gold", "✓")}${toast("Deleted", "Undo", "", "line", "✕")}${toast("Couldn’t reach memex", "Retry", "er", "err", "!")}${toast("Kept on this phone. Sends when online.", "", "", "orange", "↻")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:8px">${empty("Nothing saved yet", "", btn("Save something", "p"), "pri")}${empty("No “zellij” cards", "", btn("Save it as a jot"), "line", "⌕")}${empty("Couldn’t load", "", btn("Try again"), "err", "!")}</div>`));

add("s09", "Components", "Rows", sframe(shead("Rows", "Tasks, list rows, table rows and Journal bubbles. Rows lift on hover like cards, but never scale.") +
  `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:24px 40px">
<div class="col" style="gap:12px">${trow("Order three tile samples", "coral", "Nov 18")}${trow("Book the ryokan", "cyan", "Today", "hov")}${trow("Renew passport photos", "cyan", "late 2 days late", "foc")}${trow("Call the electrician", "coral", "", "sel")}${trow("Return library books", "gold", "", "done")}${lbl("Task rows: default, hover, focus + overdue, selected, done")}</div>
<div class="col" style="gap:12px">${lrow(W("bamboo"))}${lrow(W("lime"))}${lbl("List rows (••• → List)")}
<div class="tbl" style="margin-top:12px"><div class="tr th" style="grid-template-columns:2.4fr 1fr 1.6fr .7fr"><span>Title</span><span>Type</span><span>Space</span><span>Saved</span></div><div class="tr" style="grid-template-columns:2.4fr 1fr 1.6fr .7fr"><span class="t1"><span class="art g3"></span>Arashiyama</span><span>Link</span><span>${strip("Kyoto trip", "cyan")}</span><span>Mon</span></div><div class="tr" style="grid-template-columns:2.4fr 1fr 1.6fr .7fr;border:0"><span class="t1"><span class="art g1"></span>Oak shelving</span><span>Picture</span><span>${strip("Kitchen reno", "coral")}</span><span>2h</span></div></div>${lbl("Table rows (••• → Table)")}</div>
<div style="grid-column:span 2">${bub("Sage green island, warm oak shelves.", "8:02 AM", strip("Kitchen reno", "coral"))}${bub("Ask about the onsen ryokan near the river.", "9:10 AM", strip("Kyoto trip", "cyan", true))}</div>
</div>`));

add("s10", "Components", "Inbox cards", sframe(shead("Inbox cards", "Inbox cards are memory cards too. A proposal shows its change as a diff; a filing suggestion is one coloured pill.") + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start">${cell(proposal(), "Agent proposal: Approve leads")}${cell(suggestion(), "Filing suggestion: the pill shows where it goes")}</div>`));

add("s11", "Components", "Mobile nav", `<div class="frame m">${phone(`<div class="ph"><div class="sec" style="margin:24px 0 16px">Tab bar: active fills the icon</div>${["Journal", "Cards", "Spaces", "Inbox"].map((t: string, i: number) => `<div style="position:relative;height:112px;margin-bottom:16px;border-radius:24px;overflow:hidden;background:var(--bg)">${tabs(t, "", i === 2 ? "kf" : i === 3 ? "prs" : "")}</div>`).join("")}<div class="lab">Spaces shows focus; Inbox shows pressed.</div></div>`)}${phone(`<div class="ph"><div class="sec" style="margin:24px 0 16px">+ button and header</div><div class="row" style="gap:24px;margin:24px 0">${cell(`<div class="plus" style="width:72px;height:72px;font-size:42px">+</div>`, "Default")}${cell(`<div class="plus" style="width:72px;height:72px;font-size:42px;transform:scale(.92);filter:brightness(.92)">+</div>`, "Pressed")}${cell(`<div class="plus foc" style="width:72px;height:72px;font-size:42px">+</div>`, "Focus")}</div><div class="row" style="gap:8px;margin-top:32px">${rb("⌕", "sm")}${rb("D", "sm")}</div>${lbl("Header: search and account")}<div style="position:relative;height:200px;margin-top:32px;border-radius:24px;overflow:hidden;background:var(--line)"><div class="msheet" style="padding-bottom:24px"><div class="grab"></div><div class="h2">Sheet</div><div class="body" style="color:var(--mut)">Drag down to close.</div></div></div></div>`)}</div>`);

// s12: every small control in every state, so none is left to guess.
const SC = ["Default", "Hover", "Pressed", "Focus", "Loading", "Error", "Disabled", "On / selected"];
const na = `<span class="lab" style="color:var(--faint)">n/a</span>`;
const spin = `<span style="width:24px;height:24px;border-radius:50%;border:4px solid var(--mut);border-right-color:transparent;display:inline-block"></span>`;
const ctlRow = (name: string, cells: string[]): string => `<div class="sec" style="align-self:center">${name}</div>${cells.map((c: string) => `<div class="cell" style="justify-content:center;min-height:72px">${c}</div>`).join("")}`;
add("s12", "Components", "Controls: states", sframe(shead("Controls: every state", "Switches, checkboxes, swatches, toggle groups, inputs, menu items and tabs. “n/a” marks a state the control can’t be in.") +
  `<div style="display:grid;grid-template-columns:120px repeat(8,minmax(0,1fr));gap:8px 12px;align-items:center">
<div></div>${SC.map((s: string) => `<div class="lbl" style="margin:0">${s}</div>`).join("")}
${ctlRow("Switch", [`<div class="sw2"></div>`, `<div class="sw2 hov"></div>`, `<div class="sw2" style="box-shadow:inset 0 4px 0 rgba(0,0,0,.14)"></div>`, `<div class="sw2 foc"></div>`, `<div class="sw2 on" style="opacity:.7"></div>`, `<div class="sw2" style="box-shadow:0 0 0 3px var(--err)"></div>`, `<div class="sw2 dis"></div>`, `<div class="sw2 on"></div>`])}
${ctlRow("Checkbox", [`<div class="chk"></div>`, `<div class="chk hov"></div>`, `<div class="chk" style="transform:scale(.9);background:var(--well)"></div>`, `<div class="chk foc"></div>`, `<div class="chk" style="color:var(--mut)">${spin}</div>`, `<div class="chk" style="box-shadow:0 0 0 3px var(--err) inset"></div>`, `<div class="chk dis"></div>`, `<div class="chk on">✓</div>`])}
${ctlRow("Swatch", [`<div class="sw" style="--c:var(--green)"></div>`, `<div class="sw" style="--c:var(--green);transform:translateY(-3px)"></div>`, `<div class="sw" style="--c:var(--green);transform:scale(.92)"></div>`, `<div class="sw foc" style="--c:var(--green)"></div>`, na, na, `<div class="sw dis" style="--c:var(--green)"></div>`, `<div class="sw sel" style="--c:var(--green)"></div>`])}
${ctlRow("Toggle group", [`<div class="tg"><span>A</span><span>B</span></div>`, `<div class="tg"><span class="hov">A</span><span>B</span></div>`, `<div class="tg"><span style="background:var(--line)">A</span><span>B</span></div>`, `<div class="tg"><span class="foc">A</span><span>B</span></div>`, na, na, `<div class="tg dis"><span>A</span><span>B</span></div>`, `<div class="tg"><span class="on">A</span><span>B</span></div>`])}
${ctlRow("Input", [inp("Name…", "ph"), inp("Name…", "ph hov"), inp("Ga" + CUR, "foc"), inp("Name…", "ph foc"), inp(`<span style="flex:1">Garden</span>${spin}`), inp("Garden", "err"), inp("Name…", "ph dis"), inp("Garden")].map((x: string) => `<div style="width:132px">${x.replace('class="inp', 'style="font-size:18px;padding:0 16px" class="inp')}</div>`))}
${ctlRow("Menu item", [menuItem("", ""), menuItem("hov", ""), menuItem("prs", ""), menuItem("foc", ""), menuItem("load", ""), na, menuItem("dis", ""), menuItem("on", "✓")])}
${ctlRow("Tab (phone)", ["", "hov", "prs", "kf", "", "", "dis", "on"].map((s: string, i: number) => i === 4 || i === 5 ? na : `<div class="tabs" style="position:relative;height:72px;width:96px;box-shadow:none;background:transparent;padding:0"><span class="${s}" style="${s === "hov" ? "color:var(--ink)" : ""}"><i></i>Cards</span></div>`))}
</div>`));

// s13: the same kit in light, dark and Plex, side by side.
const themeKit = (cls: string, name: string): string => `<div class="mc ${cls}" style="background:var(--bg);border-radius:32px;padding:24px;display:flex;flex-direction:column;gap:16px;min-width:0"><div class="h2">${name}</div><div class="row" style="gap:8px;flex-wrap:nowrap">${allPill(false).replace('class="pill', 'class="pill sm')}${pill("Kitchen reno", "coral", "", "sel sm")}${pill("Kyoto", "cyan", "", "sm")}</div>${card(W("join", { h: 120 }))}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${card(W("brass", { t: "Brass pulls." }))}${card(W("lime", { t: "Lime plaster, not paint." }))}</div><div class="row" style="gap:12px;flex-wrap:nowrap">${btn("Save", "p sm")}${btn("Move", "sm")}${btn("Retry", "sm err")}</div>${trow("Book the ryokan", "cyan", "Today")}<div class="row" style="gap:16px;flex-wrap:nowrap"><div class="sw2 on"></div><div class="chk on">✓</div>${rb("•••", "sm foc")}</div></div>`;
add("s13", "Components", "Themes: light, dark, Plex", sframe(shead("Light, dark and Plex", "Label strips keep dark ink in dark mode, like a printed sticker. Notes tint from their space, so they never turn muddy.") + `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:-8px">${themeKit("", "Light")}${themeKit("dark", "Dark")}${themeKit("plex", "Plex")}</div>`));

// s14: the card-write moment, frame by frame.
const writeCard = (stage: number): string => {
  const lb = stage === 0 ? `<div class="lb" style="background:var(--well);box-shadow:none"></div>` : stage === 1 ? `<div class="lb" style="background:linear-gradient(90deg,var(--coral) 55%,var(--well) 55%)"><span>Kitchen reno</span></div>` : `<div class="lb"><span>Kitchen reno</span><i>note</i></div>`;
  const body = stage === 0 ? `<div class="nb" style="color:var(--faint)">Ask about curing time…</div>` : `<div class="nb">Ask about curing time.</div>`;
  const tf = stage === 0 ? "transform:translateY(-24px) scale(.94);opacity:.6" : stage === 1 ? "transform:translateY(-6px)" : "";
  return `<div class="card note ${stage === 2 ? "write" : ""}" style="--c:var(--coral);${stage === 0 ? "background:var(--paper);" : ""}${tf}">${body}${lb}</div>`;
};
add("s14", "Components", "Card write", sframe(shead("The card-write moment", "Saving reads as writing a memory card. 280 ms in all; with reduced motion it is one fade. A soft click plays only when Sounds is on.") +
  `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:32px;align-items:end;margin-top:24px">
${cell(`<div style="width:100%">${field("Ask about curing time" + CUR, true, "foc", plusBtn())}</div>`, "1 · You press Enter")}
${cell(`<div style="width:100%">${writeCard(0)}</div>`, "2 · 0 ms: a blank card drops into the first slot")}
${cell(`<div style="width:100%">${writeCard(1)}</div>`, "3 · 120 ms: the label stamps in, left to right")}
${cell(`<div style="width:100%">${writeCard(2)}</div>`, "4 · 280 ms: settled, Saved chip, then fades")}
</div><div style="display:flex;justify-content:center;margin-top:56px">${toast("Saved to Kitchen reno", "Open", "", "coral")}</div><div class="lbl">5 · The toast offers Open; Undo is in the card’s ••• for 6 s</div>`));

function menuItem(st: string, right: string): string {
  return `<div style="width:136px">${menu([`${st === "load" ? "" : "✎"}|${st === "load" ? "Saving" : "Edit"}|${right}|${st}`]).replace('class="menu static"', 'class="menu static" style="width:136px;padding:0;box-shadow:none;background:transparent"').replace(st === "load" ? "<i></i>" : "@@", st === "load" ? `<i>${spin}</i>` : "@@")}</div>`;
}