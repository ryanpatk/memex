type Item = { id: string; g: string; l: string; html: string; cls?: string; w?: number };
const ST = ["", "hov", "prs", "foc", "load", "err"];
const STL = ["Default", "Hover", "Pressed", "Focus", "Loading", "Error"];
const sixCols = (f: (s: string) => string, n: number = 6): string => `<div class="cs" style="grid-template-columns:repeat(${n},1fr);margin-bottom:20px">${ST.map((s: string, i: number) => cell(f(s), STL[i])).join("")}</div>`;
const ITEMS: Item[] = [];
const add = (id: string, g: string, l: string, html: string, cls: string = "", w: number = 1440): void => { ITEMS.push({ id, g, l, html, cls, w }); };

add("s01", "Components", "Tokens", sframe(shead("Tokens", "One scale for web and phone. The font is a token switch: Nunito + Inter by default, IBM Plex with the plex class.") + `
<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:56px">
<div><div class="sec" style="margin-bottom:14px">Type</div>
<div class="hero">Everything <span class="lab">hero 72</span></div><div class="h1" style="margin-top:10px">Kitchen reno <span class="lab">h1 44</span></div><div class="h2" style="margin-top:10px">Save something <span class="lab">h2 28</span></div><div class="h3" style="margin-top:10px">Card title, two lines max <span class="lab">h3 24</span></div><div class="body" style="margin-top:10px">Body copy sits at 18, never below 17. <span class="lab">body 18</span></div><div class="lab" style="margin-top:10px">Labels and meta, the floor: 16</div>
<div class="sec" style="margin:34px 0 14px">Font switch</div><div class="row" style="gap:40px;align-items:flex-start"><div><div class="h1">Memory card</div><div class="lab">default: Nunito 900 + Inter</div></div><div class="plex-demo" style="font-family:'IBM Plex Sans',sans-serif"><div style="font:700 44px/1.1 'IBM Plex Sans',sans-serif">Memory card</div><div class="lab">plex: IBM Plex Sans 700</div></div></div></div>
<div><div class="sec" style="margin-bottom:14px">Spacing</div><div class="row" style="align-items:flex-end;gap:14px">${[4, 8, 16, 24, 32, 40, 64].map((n: number) => `<div class="cell"><div style="width:${n}px;height:${n}px;background:var(--pri);border-radius:4px"></div>${lbl(String(n))}</div>`).join("")}</div>
<div class="sec" style="margin:30px 0 14px">Radii</div><div class="row" style="gap:18px">${[["12", "chip"], ["20", "picture"], ["28", "card"], ["40", "sheet"], ["999", "pill"]].map((r: string[]) => `<div class="cell"><div style="width:76px;height:76px;background:var(--paper);box-shadow:var(--sh1);border-radius:${r[0] === "999" ? "38" : r[0]}px"></div>${lbl(r[0] + " " + r[1])}</div>`).join("")}</div>
<div class="sec" style="margin:30px 0 14px">Space colours and system</div><div class="row" style="gap:12px">${["coral", "cyan", "gold", "blue", "vio", "green", "orange", "pink"].map((c: string) => `<div class="sw" style="--c:var(--${c})"></div>`).join("")}</div><div class="row" style="gap:12px;margin-top:12px">${["ink", "mut", "line", "bg", "paper", "pri", "ok", "err"].map((c: string) => `<div class="cell"><div class="sw" style="--c:var(--${c});box-shadow:0 0 0 1px var(--line)"></div>${lbl(c)}</div>`).join("")}</div>
<div class="sec" style="margin:30px 0 10px">Motion</div><div class="body" style="font-size:17px">Press 120 ms · hover and sheets 200 ms · card-write 280 ms · ease (.2,.8,.2,1) · reduced motion: fades only, no lift</div></div></div>`));

add("s02", "Components", "Buttons", sframe(shead("Buttons", "Four kinds, two sizes. Every one has the same six states.") +
  sixCols((s: string) => btn("Save", "p", s)) + sixCols((s: string) => btn("Move to…", "", s)) + sixCols((s: string) => btn("Delete", "d", s)) + sixCols((s: string) => btn("Not now", "q", s)) +
  `<div class="sec" style="margin:14px 0 16px">Round icon buttons</div>` + sixCols((s: string) => `<div class="row">${rb("•••", s)}${rb("✕", s)}${rb("D", s)}</div>`)));

add("s03", "Components", "Space pills", sframe(shead("Space pills", "A space is a coloured cartridge. Pills filter, file, and accept drops.") +
  sixCols((s: string) => pill("Kitchen reno", "coral", "38", s), 3) +
  `<div class="cs" style="grid-template-columns:repeat(4,1fr);margin-top:20px">${cell(allPill(true), "All, active")}${cell(pill("Kyoto trip", "cyan", "24", "sel"), "Filtering this space")}${cell(pill("Add 3 to Reading", "gold", "", "drop", "+"), "Drop target while dragging")}${cell(pill("Studio", "blue", "All in", ""), "Already holds the selection")}${cell(addPill(), "New space")}${cell(pill("Kitchen reno", "coral", "", "sm"), "Small, in rows and sheets")}${cell(`<div class="pill plain">More <em>6</em></div>`, "Overflow past 6 spaces")}${cell(strip("Kitchen reno", "coral") + " " + strip("Kyoto trip", "cyan", true), "Strip and suggestion strip")}</div>`));

add("s04", "Components", "Save / search field", sframe(shead("Save and search field", "One field. Typing searches as you go; Enter saves what you typed. A lone link saves a link card, [] makes a task, ⌘↵ makes a note, @ files it.") +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 40px">
${cell(`<div style="width:600px">${field("Search or save a link, a thought…", false, "", plusBtn())}</div>`, "Default")}
${cell(`<div style="width:600px">${field("Search or save a link, a thought…", false, "hov", plusBtn())}</div>`, "Hover")}
${cell(`<div style="width:600px">${field("plaster" + CUR, true, "foc", `<span class="lab" style="margin-right:12px">3 cards · ↵ saves as a jot</span>`)}</div>`, "Focus, typing: searching")}
${cell(`<div style="width:600px">${field("https://example-design.com/lime-plaster", true, "foc", `<span class="kb">Link</span>${plusBtn()}`)}</div>`, "A link was pasted")}
${cell(`<div style="width:600px">${field("Fetching the preview…", false, "foc load", `<div class="btn p load" style="width:58px;height:58px;padding:0"></div>`)}</div>`, "Loading")}
${cell(`<div style="width:600px">${field("Couldn’t save. It’s kept here, try again.", true, "err", btn("Retry", "sm"))}</div>`, "Error, nothing lost")}
${cell(`<div style="width:600px;position:relative">${field("Buy brass pulls @kit" + CUR, true, "foc", "")}${menu(["#File it in", "●|Kitchen reno||hov", "●|Kyoto trip"], "left:300px;top:84px;width:300px")}</div>`, "@ picks a space")}
${cell(`<div style="width:600px">${field("[] Order three tile samples", true, "foc", `<span class="kb">Task</span>${plusBtn()}`)}</div>`, "Recognised: task")}
</div>`));

add("s05", "Components", "Cards: variants", sframe(shead("Memory cards", "Six kinds share one body: a 28 px card, 20 px inset picture, Nunito title and a space label strip.") +
  `<div class="cs" style="grid-template-columns:repeat(3,1fr);align-items:start">
${cell(card(W("join")), "Link with picture")}${cell(card(W("oak", { h: 240 })), "Image (picture save)")}${cell(card(W("calm")), "Link without picture")}
</div><div class="cs" style="grid-template-columns:repeat(3,1fr);align-items:start;margin-top:24px">${cell(card(W("lime")), "Note")}${cell(card(W("brass")), "Journal jot")}${cell(card(W("tile")), "Task")}</div>`));

add("s06", "Components", "Cards: states", sframe(shead("Card states", "Hover lifts 4 px. Press settles. Saving writes the card with a 280 ms blink.") +
  `<div class="cs" style="grid-template-columns:repeat(5,1fr);align-items:start">
${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am" })), "Default")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "hov" })), "Hover")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "prs" })), "Pressed")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "foc" })), "Focus")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "ld" })), "Loading")}
${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "er" })), "Error: preview failed")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "selc", tick: "on" })), "Selected")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "drag" })), "Dragging")}${cell(card(W("bamboo", { h: 90, t: "Arashiyama at 7am", st: "write" })), "Just saved")}${cell(card(W("ryo", { t: "Ryokan shortlist", pin: true, ag: true })), "Pinned, agent-written")}
</div>`));

add("s07", "Components", "Menus and sheets", sframe(shead("••• menu and sheets", "Everything that isn’t on screen lives in one ••• menu. Sheets hold one task each.") +
  `<div style="display:flex;gap:40px;align-items:flex-start">
${cell(menu(["↗|Open||", "⧉|Copy link||hov", "✎|Edit…||foc", "★|Pin to top", "↻|Refresh preview", "|Show tags||dis", "-", "✕|Delete|⌫|dz"]), "Item states: hover, focus, disabled, danger")}
<div style="width:560px">${cell(`<div class="sheet static" style="width:560px;padding:40px"><div class="h2">Delete this card?</div><div class="body" style="color:var(--mut);margin-top:12px">You can undo for 6 seconds.</div><div class="sf">${btn("Cancel")}${btn("Delete", "d")}</div></div>`, "Confirm sheet")}
<div style="height:24px"></div>${cell(`<div class="sheet static" style="width:560px;padding:40px"><div class="h2">New space</div><div class="flab">Name</div>${inp("", "foc err")}<div class="ferr">A space needs a name.</div><div class="sf">${btn("Cancel", "q")}${btn("Create", "p load")}</div></div>`, "Sheet with error and loading")}</div>
${cell(menu(["#Layout", "▦|Cards||on", "☰|List", "▤|Table", "#Sort", "↓|Recently updated||on", "|Saved date", "|Title", "-", "|Saved views…"]), "View menu (•••)")}
</div>`));

add("s08", "Components", "Toasts and states", sframe(shead("Toasts, empty, loading and error", "Every change toasts with Undo. Empty states are one card and one action.") +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;justify-items:start">${toast("Saved to Kitchen reno", "Open", "", "coral", "✓")}${toast("Moved 3 cards to Reading", "Undo", "", "gold", "✓")}${toast("Deleted", "Undo", "", "mut", "✕")}${toast("Couldn’t reach memex", "Retry", "er", "err", "!")}${toast("Kept on this phone, sends when you’re online", "", "", "warn", "↻")}</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:10px">${empty("Nothing saved yet", "Paste a link or type a thought.", btn("Save something", "p"), "pri")}${empty("No cards match “zellij”", "Try fewer words.", btn("Save “zellij” as a jot", ""), "line")}${empty("Couldn’t load your cards", "Check your connection.", btn("Try again", ""), "err")}</div>`));

add("s09", "Components", "Rows", sframe(shead("Rows", "Tasks, list rows, table rows, Journal bubbles and Inbox cards.") +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 40px">
<div class="col" style="gap:12px">${trow("Order three tile samples", "coral", "Nov 18")}${trow("Book the ryokan", "cyan", "Today", "hov")}${trow("Renew passport photos", "cyan", "late 2 days late", "foc")}${trow("Return library books", "gold", "", "done")}${lbl("Task rows: default, hover, focus with overdue, done")}</div>
<div class="col" style="gap:12px">${lrow(W("bamboo"))}${lrow(W("lime"))}${lbl("List rows (••• → List)")}</div>
<div style="grid-column:span 2"><div class="tbl"><div class="tr th"><span>Title</span><span>Type</span><span>Source</span><span>Space</span><span>Saved</span></div><div class="tr"><span class="t1"><span class="art g3"></span>Arashiyama at 7am</span><span>Link</span><span>Web</span><span>${strip("Kyoto trip", "cyan")}</span><span>Mon</span></div><div class="tr"><span class="t1"><span class="art g1"></span>Warm oak shelving</span><span>Picture</span><span>Pinterest</span><span>${strip("Kitchen reno", "coral")}</span><span>2h</span></div></div>${lbl("Table rows (••• → Table)")}</div>
<div>${bub("Sage green island, warm oak shelves.", "8:02 AM", strip("Kitchen reno", "coral"))}${lbl("Journal bubbles with strip and suggestion")}</div>
</div>`));

add("s10", "Components", "Inbox cards", sframe(shead("Inbox cards", "Agent proposals show the change as a diff. Filing suggestions are one tap.") + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start">${cell(proposal(), "Agent proposal")}${cell(suggestion(), "Filing suggestion")}</div>`));

add("s11", "Components", "Mobile nav", `<div class="frame m">${phone(`<div class="ph"><div class="sec" style="margin:20px 0 14px">Tab bar</div>${["Journal", "Cards", "Spaces", "Inbox"].map((t: string) => `<div style="position:relative;height:110px;margin-bottom:14px;border-radius:24px;overflow:hidden;background:var(--bg)">${tabs(t)}</div>`).join("")}</div>`)}${phone(`<div class="ph"><div class="sec" style="margin:20px 0 14px">+ button and header</div><div class="row" style="gap:24px;margin:20px 0">${cell(`<div class="plus" style="width:72px;height:72px;font-size:42px">+</div>`, "Default")}${cell(`<div class="plus" style="width:72px;height:72px;font-size:42px;transform:scale(.92);filter:brightness(.92)">+</div>`, "Pressed")}${cell(`<div class="plus foc" style="width:72px;height:72px;font-size:42px">+</div>`, "Focus")}</div><div class="row" style="gap:10px;margin-top:30px">${btn("Tasks 6", "sm")}${rb("D", "sm")}</div>${lbl("Header: tasks pill and account")}<div style="position:relative;height:200px;margin-top:30px;border-radius:24px;overflow:hidden;background:var(--line)"><div class="msheet" style="padding-bottom:20px"><div class="grab"></div><div class="h2">Sheet</div><div class="body" style="color:var(--mut)">Drags down to close.</div></div></div></div>`)}</div>`);
