let ENTRIES = [];
let SUKTA_PAGES = [];
let CURRENT_PAGE_INDEX = 0;
let searchDebounceTimer = null;
let SHOW_PADA_PATHA = false;

let RIK_INDEX = new Map();       // "06.064.04" -> entry
let ASHTAKA_INDEX = new Map();   // "5.1.05.04" -> entry
let PAGE_INDEX = new Map();      // "6-64" -> pageIndex

const MAX_RESULTS = 200;

const topbar = document.getElementById("topbar");
const headerToggle = document.getElementById("headerToggle");

headerToggle.addEventListener("click", () => {
  const collapsed = topbar.classList.toggle("collapsed");
  headerToggle.setAttribute(
    "aria-label",
    collapsed ? "Show header" : "Hide header"
  );
});

async function loadData() {
  const status = document.getElementById("status");

  try {
    setStatus("Loading data...");

    const res = await fetch("rigveda.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    ENTRIES = flattenFlatRigvedaData(data);
    SUKTA_PAGES = buildSuktaPages(ENTRIES);
    buildIndexes();

    if (SUKTA_PAGES.length === 0) {
      setStatus("No data found");
      return;
    }

    bindEvents();
    updatePadaToggleButton();
    updateJumpModeUI();
    renderBrowseMode();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  }
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message;
}

function flattenFlatRigvedaData(data) {
  const entries = [];

  for (const [ref, value] of Object.entries(data || {})) {
    const rikNum = String(value?.rik_num ?? ref ?? "").trim();
    const ashtakaRef = String(value?.ashtaka_ref ?? "").trim();
    const anuvakaRef = String(value?.anuvaka_ref ?? "").trim();

    const text = String(
      value?.text ??
      value?.samh_dev_acc ??
      ""
    ).trim();

    const padaPatha = String(
      value?.pada_dev_acc ??
      value?.pada_patha ??
      ""
    ).trim();

    const rikParsed = parseRikRef(rikNum);
    const ashtakaParsed = parseAshtakaRef(ashtakaRef);

    entries.push(makeEntryObject({
      ref: rikNum || String(ref),
      rikNum,
      ashtakaRef,
      anuvakaRef,
      text,
      padaPatha,

      mandala: rikParsed.mandala,
      sukta: rikParsed.sukta,
      mantra: rikParsed.mantra,

      ashtaka: ashtakaParsed.ashtaka,
      adhyaya: ashtakaParsed.adhyaya,
      varga: ashtakaParsed.varga,
      ashtakaRicha: ashtakaParsed.richa,

      entryId: rikParsed.mantra ?? 0,
    }));
  }

  entries.sort((a, b) => {
    if ((a.mandala ?? Infinity) !== (b.mandala ?? Infinity)) {
      return (a.mandala ?? Infinity) - (b.mandala ?? Infinity);
    }
    if ((a.sukta ?? Infinity) !== (b.sukta ?? Infinity)) {
      return (a.sukta ?? Infinity) - (b.sukta ?? Infinity);
    }
    return (a.mantra ?? Infinity) - (b.mantra ?? Infinity);
  });

  return entries;
}

function makeEntryObject({
  ref,
  rikNum,
  ashtakaRef,
  anuvakaRef,
  text,
  padaPatha,
  mandala,
  sukta,
  mantra,
  ashtaka,
  adhyaya,
  varga,
  ashtakaRicha,
  entryId
}) {
  const searchRef = normalizeForSearch(ref);
  const searchText = normalizeForSearch(text);
  const latinRef = normalizeLatinQuery(ref);
  const latinText = transliterateForSearch(text);

  return {
    ref,
    rikNum,
    ashtakaRef,
    anuvakaRef,
    text,
    padaPatha,

    mandala,
    sukta,
    mantra,

    ashtaka,
    adhyaya,
    varga,
    ashtakaRicha,

    entryId,

    searchRef,
    searchText,
    compactRef: compactForSearch(searchRef),
    compactText: compactForSearch(searchText),

    latinRef,
    latinText,
    compactLatinRef: compactForSearch(latinRef),
    compactLatinText: compactForSearch(latinText),
  };
}

function parseRikRef(ref) {
  const m = String(ref ?? "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    return {
      mandala: null,
      sukta: null,
      mantra: null,
    };
  }

  return {
    mandala: Number(m[1]),
    sukta: Number(m[2]),
    mantra: Number(m[3]),
  };
}

function parseAshtakaRef(ref) {
  const m = String(ref ?? "").match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    return {
      ashtaka: null,
      adhyaya: null,
      varga: null,
      richa: null,
    };
  }

  return {
    ashtaka: Number(m[1]),
    adhyaya: Number(m[2]),
    varga: Number(m[3]),
    richa: Number(m[4]),
  };
}

function buildSuktaPages(entries) {
  const map = new Map();

  for (const item of entries) {
    const key = `${item.mandala}-${item.sukta}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        mandala: item.mandala,
        sukta: item.sukta,
        items: [],
      });
    }

    map.get(key).items.push(item);
  }

  const pages = [...map.values()];

  pages.sort((a, b) => {
    if ((a.mandala ?? Infinity) !== (b.mandala ?? Infinity)) {
      return (a.mandala ?? Infinity) - (b.mandala ?? Infinity);
    }
    return (a.sukta ?? Infinity) - (b.sukta ?? Infinity);
  });

  for (const page of pages) {
    page.items.sort((a, b) => (a.mantra ?? Infinity) - (b.mantra ?? Infinity));
  }

  return pages;
}

function buildIndexes() {
  RIK_INDEX = new Map();
  ASHTAKA_INDEX = new Map();
  PAGE_INDEX = new Map();

  for (const item of ENTRIES) {
    if (item.rikNum) {
      RIK_INDEX.set(normalizeDotRef(item.rikNum), item);
    }
    if (item.ashtakaRef) {
      ASHTAKA_INDEX.set(normalizeDotRef(item.ashtakaRef), item);
    }
  }

  SUKTA_PAGES.forEach((page, index) => {
    PAGE_INDEX.set(`${page.mandala}-${page.sukta}`, index);
  });
}

function bindEvents() {
  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", (e) => {
      const rawQuery = e.target.value.trim();

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      if (!rawQuery) {
        renderBrowseMode();
        return;
      }

      setStatus("Waiting for typing to stop...");

      searchDebounceTimer = setTimeout(() => {
        onSearchInput(e);
      }, 2000);
    });
  }

  const prevTop = document.getElementById("prevTop");
  const nextTop = document.getElementById("nextTop");
  const prevBottom = document.getElementById("prevBottom");
  const nextBottom = document.getElementById("nextBottom");

  if (prevTop) prevTop.addEventListener("click", () => goToPage(CURRENT_PAGE_INDEX - 1));
  if (nextTop) nextTop.addEventListener("click", () => goToPage(CURRENT_PAGE_INDEX + 1));
  if (prevBottom) prevBottom.addEventListener("click", () => goToPage(CURRENT_PAGE_INDEX - 1));
  if (nextBottom) nextBottom.addEventListener("click", () => goToPage(CURRENT_PAGE_INDEX + 1));

  const togglePadaBtn = document.getElementById("togglePadaBtn");
  if (togglePadaBtn) {
    togglePadaBtn.addEventListener("click", () => {
      SHOW_PADA_PATHA = !SHOW_PADA_PATHA;
      updatePadaToggleButton();

      const search = document.getElementById("search");
      const rawQuery = search ? search.value.trim() : "";

      if (rawQuery) {
        const { mode, results } = searchEntries(rawQuery);
        renderSearchMode(rawQuery, mode, results);
      } else {
        renderBrowseMode();
      }
    });
  }

  const jumpMode = document.getElementById("jumpMode");
  if (jumpMode) {
    jumpMode.addEventListener("change", () => {
      updateJumpModeUI();
    });
  }

  const jumpGo = document.getElementById("jumpGo");
  if (jumpGo) {
    jumpGo.addEventListener("click", onJumpGo);
  }

  const jumpInputs = ["jump1", "jump2", "jump3", "jump4"];
  for (const id of jumpInputs) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        onJumpGo();
      }
    });
  }
}

function updatePadaToggleButton() {
  const btn = document.getElementById("togglePadaBtn");
  if (!btn) return;

  btn.textContent = SHOW_PADA_PATHA ? "Pada Patha: ON" : "Pada Patha: OFF";
  btn.classList.toggle("active", SHOW_PADA_PATHA);
}

function updateJumpModeUI() {
  const mode = document.getElementById("jumpMode")?.value || "rik";

  const jump1 = document.getElementById("jump1");
  const jump2 = document.getElementById("jump2");
  const jump3 = document.getElementById("jump3");

  if (!jump1 || !jump2 || !jump3) return;

  jump1.value = "1";
  jump2.value = "1";
  jump3.value = "1";

  if (mode === "rik") {
    jump1.placeholder = "Mandala";
    jump2.placeholder = "Sukta";
    jump3.classList.add("hidden");
  } else {
    jump1.placeholder = "Ashtaka";
    jump2.placeholder = "Adhyaya";
    jump3.placeholder = "Varga";
    jump3.classList.remove("hidden");
  }
}

function onJumpGo() {
  const mode = document.getElementById("jumpMode")?.value || "rik";

  const v1 = document.getElementById("jump1")?.value.trim();
  const v2 = document.getElementById("jump2")?.value.trim();
  const v3 = document.getElementById("jump3")?.value.trim();

  if (mode === "rik") {
    if (!v1 || !v2) {
      setStatus("Please enter Mandala and Sukta.");
      return;
    }

    // default richa = 1
    const key = buildRikKey(v1, v2, 1);
    const entry = RIK_INDEX.get(key);

    if (!entry) {
      setStatus(`Not found: ${key}`);
      return;
    }

    openEntryInContext(entry.ref);
    return;
  }

  if (!v1 || !v2 || !v3) {
    setStatus("Please enter Ashtaka, Adhyaya, and Varga.");
    return;
  }

  // default richa = 1
  const key = buildAshtakaKey(v1, v2, v3, 1);
  const entry = ASHTAKA_INDEX.get(key);

  if (!entry) {
    setStatus(`Not found: ${key}`);
      return;
  }

  openEntryInContext(entry.ref);
}

function buildRikKey(mandala, sukta, richa) {
  return [
    padInt(mandala, 2),
    padInt(sukta, 3),
    padInt(richa, 2)
  ].join(".");
}

function buildAshtakaKey(ashtaka, adhyaya, varga, richa) {
  return [
    String(Number(ashtaka)),
    String(Number(adhyaya)),
    padInt(varga, 2),
    padInt(richa, 2)
  ].join(".");
}

function normalizeDotRef(ref) {
  return String(ref ?? "").trim();
}

function padInt(value, width) {
  return String(Number(value)).padStart(width, "0");
}

function onSearchInput(e) {
  const rawQuery = e.target.value.trim();

  if (!rawQuery) {
    renderBrowseMode();
    return;
  }

  setStatus("Searching...");

  const { mode, results } = searchEntries(rawQuery);
  renderSearchMode(rawQuery, mode, results);
}

function goToPage(index) {
  if (index < 0 || index >= SUKTA_PAGES.length) return;

  CURRENT_PAGE_INDEX = index;
  renderBrowseMode();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderBrowseMode(targetRef = null) {
  const page = SUKTA_PAGES[CURRENT_PAGE_INDEX];
  const root = document.getElementById("results");

  if (!page || !root) {
    if (root) root.innerHTML = `<div class="mantra">No page found.</div>`;
    return;
  }

  updatePageInfo();
  enablePagerButtons();
  updatePagerButtons();

  setStatus(
    `${page.items.length} mantras · Mandala ${page.mandala} · Sukta ${String(page.sukta).padStart(3, "0")}`
  );

  root.innerHTML = "";

  for (const item of page.items) {
    const card = document.createElement("div");
    card.className = "mantra";
    card.setAttribute("data-ref", item.ref);

    card.innerHTML = `
      <div class="ref">${escapeHtml(item.ref)}</div>
      <div class="meta-ref">
        ${item.ashtakaRef ? `Ashtaka: ${escapeHtml(item.ashtakaRef)}` : ""}
      </div>
      <div class="samhita-text">${escapeHtml(item.text)}</div>
      ${
        SHOW_PADA_PATHA && item.padaPatha
          ? `<div class="pada-patha">${escapeHtml(item.padaPatha)}</div>`
          : ""
      }
    `;

    root.appendChild(card);
  }

  if (targetRef) {
    centerAndHighlight(targetRef);
  }
}

function renderSearchMode(rawQuery, mode, results) {
  const root = document.getElementById("results");

  if (!root) return;

  updatePageInfo("Search results");
  disablePagerButtons();

  if (mode === "exact") {
    setStatus(`${results.length} result${results.length === 1 ? "" : "s"} for "${rawQuery}"`);
  } else if (mode === "compact") {
    setStatus(`${results.length} result${results.length === 1 ? "" : "s"} for "${rawQuery}" (space-insensitive / transliteration match)`);
  } else {
    setStatus(`${results.length} result${results.length === 1 ? "" : "s"} for "${rawQuery}" (fuzzy fallback)`);
  }

  root.innerHTML = "";

  if (results.length === 0) {
    root.innerHTML = `<div class="mantra">No results</div>`;
    return;
  }

  for (const item of results) {
    const card = document.createElement("div");
    card.className = "mantra clickable";

    card.innerHTML = `
      <div class="ref">${escapeHtml(item.ref)} · Mandala ${item.mandala} · Sukta ${String(item.sukta).padStart(3, "0")}</div>
      <div class="meta-ref">
        ${item.ashtakaRef ? `Ashtaka: ${escapeHtml(item.ashtakaRef)}` : ""}
      </div>
      <div class="samhita-text">${escapeHtml(item.text)}</div>
      ${
        SHOW_PADA_PATHA && item.padaPatha
          ? `<div class="pada-patha">${escapeHtml(item.padaPatha)}</div>`
          : ""
      }
    `;

    card.addEventListener("click", () => openEntryInContext(item.ref));
    root.appendChild(card);
  }
}

function openEntryInContext(ref) {
  const entry = RIK_INDEX.get(normalizeDotRef(ref));
  if (!entry) return;

  const pageKey = `${entry.mandala}-${entry.sukta}`;
  const pageIndex = PAGE_INDEX.get(pageKey);

  if (pageIndex == null) return;

  CURRENT_PAGE_INDEX = pageIndex;

  const search = document.getElementById("search");
  if (search) search.value = "";

  renderBrowseMode(ref);
}

function centerAndHighlight(ref) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-ref="${cssEscape(ref)}"]`);
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    el.classList.add("highlight");
    setTimeout(() => {
      el.classList.remove("highlight");
    }, 2500);
  });
}

function updatePageInfo(overrideText = null) {
  const top = document.getElementById("pageInfo");
  const bottom = document.getElementById("pageInfoBottom");

  let text = overrideText;

  if (!text) {
    const page = SUKTA_PAGES[CURRENT_PAGE_INDEX];
    text = `Mandala ${page.mandala} · Sukta ${String(page.sukta).padStart(3, "0")} · ${CURRENT_PAGE_INDEX + 1}/${SUKTA_PAGES.length}`;
  }

  if (top) top.textContent = text;
  if (bottom) bottom.textContent = text;
}

function updatePagerButtons() {
  const atStart = CURRENT_PAGE_INDEX <= 0;
  const atEnd = CURRENT_PAGE_INDEX >= SUKTA_PAGES.length - 1;

  const prevTop = document.getElementById("prevTop");
  const prevBottom = document.getElementById("prevBottom");
  const nextTop = document.getElementById("nextTop");
  const nextBottom = document.getElementById("nextBottom");

  if (prevTop) prevTop.disabled = atStart;
  if (prevBottom) prevBottom.disabled = atStart;
  if (nextTop) nextTop.disabled = atEnd;
  if (nextBottom) nextBottom.disabled = atEnd;
}

function disablePagerButtons() {
  const ids = ["prevTop", "prevBottom", "nextTop", "nextBottom"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  }
}

function enablePagerButtons() {
  const ids = ["prevTop", "prevBottom", "nextTop", "nextBottom"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function normalizeForSearch(input) {
  const text = String(input ?? "");

  return text
    .normalize("NFC")
    .replace(/[०-९]/g, (d) => "०१२३४५६७८९".indexOf(d))
    .replace(/[\u0951\u0952\u1CD0-\u1CFA\uA8E0-\uA8F1]/g, "")
    .replace(/[।॥.,;:!?'"“”‘’()[\]{}\-—_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLatinQuery(input) {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/sh/g, "s")
    .replace(/w/g, "v")
    .replace(/[āáàâä]/g, "aa")
    .replace(/[īíìîï]/g, "ii")
    .replace(/[ūúùûü]/g, "uu")
    .replace(/[ṛŕ]/g, "r")
    .replace(/[ṝ]/g, "rr")
    .replace(/[ḷ]/g, "l")
    .replace(/[ḹ]/g, "ll")
    .replace(/[ṅñṇ]/g, "n")
    .replace(/[ṭ]/g, "t")
    .replace(/[ḍ]/g, "d")
    .replace(/[śṣ]/g, "s")
    .replace(/[ṃṁ]/g, "m")
    .replace(/[ḥ]/g, "h")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateForSearch(input) {
  let s = String(input ?? "").normalize("NFC");

  s = s.replace(/[\u0951\u0952\u1CD0-\u1CFA\uA8E0-\uA8F1]/g, "");

  s = s
    .replace(/ं/g, "m")
    .replace(/ः/g, "h")
    .replace(/ँ/g, "m")
    .replace(/ऽ/g, "");

  const independentVowels = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
    "ऋ": "r", "ॠ": "rr", "ऌ": "l", "ॡ": "ll", "ए": "e", "ऐ": "ai",
    "ओ": "o", "औ": "au"
  };

  const vowelSigns = {
    "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu",
    "ृ": "r", "ॄ": "rr", "ॢ": "l", "ॣ": "ll",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au"
  };

  const consonants = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "s", "ष": "s", "स": "s", "ह": "h",
    "ळ": "l"
  };

  const digits = {
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"
  };

  let out = "";

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1] || "";

    if (digits[ch]) {
      out += digits[ch];
      continue;
    }

    if (independentVowels[ch]) {
      out += independentVowels[ch];
      continue;
    }

    if (consonants[ch]) {
      let base = consonants[ch];

      if (next === "्") {
        out += base;
        i += 1;
        continue;
      }

      if (vowelSigns[next]) {
        out += base + vowelSigns[next];
        i += 1;
        continue;
      }

      out += base + "a";
      continue;
    }

    if (/[।॥.,;:!?'"“”‘’()[\]{}\-—_/\\\s]/.test(ch)) {
      out += " ";
      continue;
    }

    if (vowelSigns[ch]) {
      out += vowelSigns[ch];
      continue;
    }
  }

  return normalizeLatinQuery(out);
}

function compactForSearch(text) {
  return text.replace(/\s+/g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function fuzzyScore(queryCompact, targetCompact) {
  if (!queryCompact || !targetCompact) return Infinity;
  if (targetCompact.includes(queryCompact)) return 0;

  const qLen = queryCompact.length;
  if (qLen === 0) return Infinity;

  let best = Infinity;

  const minWindow = Math.max(1, qLen - 2);
  const maxWindow = Math.min(targetCompact.length, qLen + 2);

  for (let win = minWindow; win <= maxWindow; win++) {
    for (let i = 0; i + win <= targetCompact.length; i++) {
      const slice = targetCompact.slice(i, i + win);
      const dist = levenshtein(queryCompact, slice);
      if (dist < best) best = dist;
      if (best === 0) return 0;
    }
  }

  return best;
}

function searchEntries(rawQuery) {
  const q = normalizeForSearch(rawQuery);
  const qCompact = compactForSearch(q);

  const latinQ = normalizeLatinQuery(rawQuery);
  const latinCompactQ = compactForSearch(latinQ);

  const hasLatinQuery = latinQ.length > 0;
  const hasLatinCompactQuery = latinCompactQ.length > 0;

  if (!rawQuery.trim()) {
    return {
      mode: "default",
      results: [],
    };
  }

  const exact = [];
  for (const item of ENTRIES) {
    if (
      item.searchRef.includes(q) ||
      item.searchText.includes(q) ||
      (hasLatinQuery && (
        item.latinRef.includes(latinQ) ||
        item.latinText.includes(latinQ)
      ))
    ) {
      exact.push(item);
      if (exact.length >= MAX_RESULTS) break;
    }
  }

  if (exact.length > 0) {
    return {
      mode: "exact",
      results: exact,
    };
  }

  const compact = [];
  for (const item of ENTRIES) {
    if (
      item.compactRef.includes(qCompact) ||
      item.compactText.includes(qCompact) ||
      (hasLatinCompactQuery && (
        item.compactLatinRef.includes(latinCompactQ) ||
        item.compactLatinText.includes(latinCompactQ)
      ))
    ) {
      compact.push(item);
      if (compact.length >= MAX_RESULTS) break;
    }
  }

  if (compact.length > 0) {
    return {
      mode: "compact",
      results: compact,
    };
  }

  const baseLen = hasLatinCompactQuery ? latinCompactQ.length : 0;
  if (baseLen < 3) {
    return {
      mode: "fuzzy",
      results: [],
    };
  }

  const fuzzyCandidates = [];
  for (const item of ENTRIES) {
    const latinRefScore = hasLatinCompactQuery
      ? fuzzyScore(latinCompactQ, item.compactLatinRef)
      : Infinity;

    const latinTextScore = hasLatinCompactQuery
      ? fuzzyScore(latinCompactQ, item.compactLatinText)
      : Infinity;

    const score = Math.min(latinRefScore, latinTextScore);

    const allowed =
      baseLen <= 4 ? 1 :
      baseLen <= 8 ? 2 : 3;

    if (score <= allowed) {
      fuzzyCandidates.push({ item, score });
    }
  }

  fuzzyCandidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.item.ref.localeCompare(b.item.ref);
  });

  return {
    mode: "fuzzy",
    results: fuzzyCandidates.slice(0, MAX_RESULTS).map((x) => x.item),
  };
}

loadData();