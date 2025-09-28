// =================================================================================
// SETUP & CONFIG
// =================================================================================
const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MEALS = ["Colazione", "Spuntino", "Pranzo", "Cena"];
const ALL_ALLERGENS = ["glutine", "latticini", "uova", "crostacei", "pesce", "arachidi", "soia", "frutta_a_guscio", "sesamo", "solfiti", "molluschi", "nickel"];

let DB = []; // Database degli alimenti da foods.xml
let CATS = []; // Categorie di alimenti uniche

// Stato dell'applicazione, caricato da localStorage o inizializzato
let state = loadState() || {
  plans: { adults: emptyPlan(), children: emptyPlan() },
  filters: { exAllergens: new Set() },
  activeCat: null,
  adults: 1,
  children: 1,
};
// Assicura che exAllergens sia sempre un Set
state.filters.exAllergens = new Set(state.filters.exAllergens);

// Riferimenti agli elementi del DOM
const els = {
  planners: {
    adults: document.getElementById('planner-adults'),
    children: document.getElementById('planner-children'),
  },
  items: document.getElementById('items'),
  tabs: document.getElementById('categoryTabs'),
  allergenFilters: document.getElementById('allergenFilters'),
  visibleCount: document.getElementById('visibleCount'),
  kcal: {
    adults: document.getElementById('kcalAdult'),
    children: document.getElementById('kcalChild'),
  },
  personCounts: {
    adults: document.getElementById('adults'),
    children: document.getElementById('children'),
  },
  shop: {
    drawer: document.getElementById('shopDrawer'),
    list: document.getElementById('shopList'),
    closeBtn: document.getElementById('closeShop'),
    copyBtn: document.getElementById('copyShop'),
    downloadBtn: document.getElementById('downloadShop'),
  },
  // Aggiungo i bottoni di controllo qui per coerenza
  btnClear: document.getElementById('btnClear'),
  btnExport: document.getElementById('btnExport'),
  btnImport: document.getElementById('btnImport'),
  btnShop: document.getElementById('btnShop'),
  btnRandomCategory: document.getElementById('btnRandomCategory'),
};

// =================================================================================
// INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadDB();
  CATS = [...new Set(DB.map(x => x.cat))].sort();
  if (!state.activeCat || !CATS.includes(state.activeCat)) {
    state.activeCat = CATS[0] || null;
  }
  renderAll();
  bindEvents();
}

async function loadDB() {
  try {
    const res = await fetch('foods.xml', { cache: 'no-store' });
    if (!res.ok) throw new Error('Fetch failed');
    const xmlText = await res.text();
    parseAndSetDB(xmlText, 'xml');
  } catch (e) {
    console.warn("Caricamento da foods.xml fallito, uso il fallback.", e);
    const fallback = document.getElementById('foodsFallback')?.textContent?.trim();
    if (fallback) parseAndSetDB(fallback, 'xml');
    else toast('Errore critico: impossibile caricare il database degli alimenti.', 'err');
  }
}

function parseAndSetDB(data, type) {
    if (type === 'xml') {
        const doc = new DOMParser().parseFromString(data, 'application/xml');
        const items = [...doc.querySelectorAll('item')];
        DB = items.map(el => ({
            id: el.getAttribute('name').toLowerCase().replace(/\s+/g, '-'),
            name: el.getAttribute('name'),
            cat: el.getAttribute('cat'),
            allergens: splitCSV(el.getAttribute('allergens')),
            kcal100: toNum(el.getAttribute('kcal100')),
            portion_adult_g: toNum(el.getAttribute('portion_adult_g')),
            portion_child_g: toNum(el.getAttribute('portion_child_g')),
        }));
    } else if (type === 'json') {
        try {
            DB = JSON.parse(data).map(item => ({
                ...item,
                id: item.name.toLowerCase().replace(/\s+/g, '-'),
            }));
        } catch (e) {
            toast('Errore: file JSON non valido.', 'err');
            return;
        }
    }
    // Ricrea le categorie e rinfresca la UI
    CATS = [...new Set(DB.map(x => x.cat))].sort();
    if (!state.activeCat || !CATS.includes(state.activeCat)) {
        state.activeCat = CATS[0] || null;
    }
    renderAll();
}

// =================================================================================
// RENDERING FUNCTIONS
// =================================================================================
function renderAll() {
  renderAllergenFilters();
  renderTabs();
  renderItems();
  renderGrid('adults');
  renderGrid('children');
  updateKcalTotals();

  // Aggiorna i valori degli input per persone
  els.personCounts.adults.value = state.adults;
  els.personCounts.children.value = state.children;

  // Nasconde i planner se il numero di persone è 0
  document.getElementById('adults-planner-container').style.display = state.adults > 0 ? '' : 'none';
  document.getElementById('children-planner-container').style.display = state.children > 0 ? '' : 'none';
}

function renderGrid(plannerType) {
  const table = els.planners[plannerType];
  if (!table) return;

  const plan = state.plans[plannerType];
  const thead = `<thead><tr><th>Pasto</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;

  const tbody = MEALS.map((meal, mi) => `
    <tr>
      <td><strong>${meal}</strong></td>
      ${DAYS.map((day, di) => {
        const item = plan[key(di, mi)];
        const slotContent = item
          ? `<div class="name">${item.name}</div><div class="cat">${item.cat}</div>`
          : `<span class="empty">Vuoto</span>`;

        const { warning, error } = checkSlotValidity(item, di, mi, plannerType);
        const classes = ['slot'];
        if (!item) classes.push('empty');
        if (warning) classes.push('warn');
        if (error) classes.push('error');

        return `
          <td data-day="${di}" data-meal="${mi}" data-planner="${plannerType}" class="${classes.join(' ')}">
            ${slotContent}
          </td>`;
      }).join('')}
    </tr>
  `).join('');

  table.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
}

function renderItems() {
  const visible = visibleItems();
  els.items.innerHTML = visible.map(item => `
    <div class="item" draggable="true" data-item-id="${item.id}">
      <div class="name">${item.name}</div>
      <div class="badge">${item.cat}</div>
    </div>
  `).join('');
  els.visibleCount.textContent = `${visible.length}/${DB.length} visibili`;
}

function renderTabs() {
  els.tabs.innerHTML = CATS.map(cat => `
    <div class="chip ${state.activeCat === cat ? 'active' : ''}" data-cat="${cat}">
      ${cat}
    </div>
  `).join('');
}

function renderAllergenFilters() {
    els.allergenFilters.innerHTML = ALL_ALLERGENS.map(allergen => `
        <label>
            <input type="checkbox" data-allergen="${allergen}" ${state.filters.exAllergens.has(allergen) ? 'checked' : ''}>
            ${allergen.charAt(0).toUpperCase() + allergen.slice(1)}
        </label>
    `).join('');
}

// =================================================================================
// EVENT BINDING
// =================================================================================
function bindEvents() {
  // Filtri categorie
  els.tabs.addEventListener('click', e => {
    if (e.target.matches('.chip[data-cat]')) {
      state.activeCat = e.target.dataset.cat;
      saveState();
      renderTabs();
      renderItems();
    }
  });

  // Filtri allergeni
  els.allergenFilters.addEventListener('change', e => {
    if (e.target.matches('input[type=checkbox]')) {
      const { allergen } = e.target.dataset;
      if (e.target.checked) {
        state.filters.exAllergens.add(allergen);
      } else {
        state.filters.exAllergens.delete(allergen);
      }
      saveState();
      renderItems();
      renderGrid('adults');
      renderGrid('children');
    }
  });

  // Drag & Drop
  let draggedItemId = null;
  els.items.addEventListener('dragstart', e => {
    if (e.target.matches('.item[data-item-id]')) {
      draggedItemId = e.target.dataset.itemId;
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  const allPlanners = [els.planners.adults, els.planners.children];
  allPlanners.forEach(planner => {
    if (!planner) return;
    planner.addEventListener('dragover', e => {
      e.preventDefault();
      if (e.target.matches('td[data-day]')) {
        e.target.style.background = '#e0e7ff'; // Feedback visivo
      }
    });
    planner.addEventListener('dragleave', e => {
      if (e.target.matches('td[data-day]')) {
        e.target.style.background = '';
      }
    });
    planner.addEventListener('drop', e => {
      e.preventDefault();
      if (!e.target.matches('td[data-day]')) return;
      e.target.style.background = '';

      const item = DB.find(i => i.id === draggedItemId);
      const { day, meal, planner: plannerType } = e.target.dataset;

      if (item && canPlace(item, +day, +meal, plannerType).valid) {
        state.plans[plannerType][key(+day, +meal)] = item;
        saveState();
        renderGrid(plannerType);
        updateKcalTotals();
      } else {
        toast('Spostamento non consentito!', 'warn');
      }
    });

    // Double click per rimuovere o randomizzare
    planner.addEventListener('dblclick', e => {
        if (!e.target.matches('td[data-day]')) return;
        const { day, meal, planner: plannerType } = e.target.dataset;
        const di = +day;
        const mi = +meal;
        const currentItem = state.plans[plannerType][key(di, mi)];

        if (currentItem) {
            // Rimuovi
            state.plans[plannerType][key(di, mi)] = null;
            toast(`"${currentItem.name}" rimosso`, 'info');
        } else {
            // Randomizza
            const pool = visibleItems().filter(item => canPlace(item, di, mi, plannerType).valid);
            if (pool.length > 0) {
                const randomItem = pool[Math.floor(Math.random() * pool.length)];
                state.plans[plannerType][key(di, mi)] = randomItem;
                toast(`🎲 Aggiunto: ${randomItem.name}`, 'info');
            } else {
                toast('Nessun alimento adatto disponibile per questo slot.', 'warn');
            }
        }
        saveState();
        renderGrid(plannerType);
        updateKcalTotals();
    });
  });

  // Controlli principali
  els.btnClear.onclick = () => {
    if (confirm('Sei sicuro di voler svuotare entrambi i planner?')) {
      state.plans = { adults: emptyPlan(), children: emptyPlan() };
      saveState();
      renderAll();
    }
  };

  els.btnExport.onclick = exportPlan;
  els.btnImport.onclick = importPlan;

  // Gestione numero persone
  els.personCounts.adults.onchange = () => {
    state.adults = Math.max(0, toNum(els.personCounts.adults.value));
    saveState();
    updateKcalTotals();
    buildShoppingList();
    document.getElementById('adults-planner-container').style.display = state.adults > 0 ? '' : 'none';
  };
   els.personCounts.children.onchange = () => {
    state.children = Math.max(0, toNum(els.personCounts.children.value));
    saveState();
    updateKcalTotals();
    buildShoppingList();
    document.getElementById('children-planner-container').style.display = state.children > 0 ? '' : 'none';
  };

  // Lista spesa
  els.btnShop.onclick = () => {
    buildShoppingList();
    els.shop.drawer.classList.remove('hidden');
  };
  els.shop.closeBtn.onclick = () => els.shop.drawer.classList.add('hidden');
  els.shop.copyBtn.onclick = () => {
    if (!els.shop.list) return;
    navigator.clipboard.writeText(els.shop.list.innerText)
      .then(() => toast('Lista copiata!'))
      .catch(() => toast('Impossibile copiare la lista.', 'err'));
  };
  els.shop.downloadBtn.onclick = () => {
    const text = els.shop.list.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lista-spesa.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Aggiungo un nuovo bottone per l'upload
  const btnUpload = document.createElement('button');
  btnUpload.textContent = 'Carica DB';
  btnUpload.className = 'ghost';
  btnUpload.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xml,.json';
      input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
              const fileContent = ev.target.result;
              const fileType = file.name.endsWith('.xml') ? 'xml' : 'json';
              parseAndSetDB(fileContent, fileType);
              toast(`Database ${file.name} caricato!`, 'info');
          };
          reader.readAsText(file);
      };
      input.click();
  };
  els.btnImport.after(btnUpload);
}

// =================================================================================
// LOGIC & RULES
// =================================================================================
function canPlace(item, day, meal, plannerType) {
  const plan = state.plans[plannerType];

  // 1. Allergie
  if (item.allergens.some(a => state.filters.exAllergens.has(a))) {
    return { valid: false, reason: 'Allergene escluso' };
  }

  // 2. Max 2 occorrenze a settimana
  const count = Object.values(plan).filter(i => i && i.id === item.id).length;
  if (count >= 2) {
    return { valid: false, reason: 'Massimo 2 volte a settimana' };
  }

  // 3. Max 2 carboidrati consecutivi
  if (item.cat === 'carboidrati') {
    const prevMeal = plan[key(day, meal - 1)];
    const nextMeal = plan[key(day, meal + 1)];
    if ((prevMeal && prevMeal.cat === 'carboidrati') && (nextMeal && nextMeal.cat === 'carboidrati')) {
        return { valid: false, reason: 'Troppi carboidrati consecutivi' };
    }
    // Check across days
    if(meal === 0) { // Colazione
        const prevDayDinner = plan[key(day - 1, MEALS.length - 1)];
        if(prevDayDinner && prevDayDinner.cat === 'carboidrati' && nextMeal && nextMeal.cat === 'carboidrati') {
            return { valid: false, reason: 'Troppi carboidrati consecutivi' };
        }
    }
    if(meal === MEALS.length - 1) { // Cena
        const nextDayBreakfast = plan[key(day + 1, 0)];
        if(prevMeal && prevMeal.cat === 'carboidrati' && nextDayBreakfast && nextDayBreakfast.cat === 'carboidrati') {
            return { valid: false, reason: 'Troppi carboidrati consecutivi' };
        }
    }
  }

  return { valid: true };
}

function checkSlotValidity(item, day, meal, plannerType) {
    if (!item) return { warning: null, error: null };
    const plan = state.plans[plannerType];
    let warning = null, error = null;

    // Controllo carboidrati consecutivi
    if (item.cat === 'carboidrati') {
        const prev = plan[key(day, meal - 1)];
        const next = plan[key(day, meal + 1)];
        if (prev && prev.cat === 'carboidrati' && next && next.cat === 'carboidrati') {
            error = '3 carboidrati di fila';
        }
    }

    // Controllo occorrenze
    const count = Object.values(plan).filter(i => i && i.id === item.id).length;
    if (count > 2) {
        error = `"${item.name}" presente ${count} volte`;
    }

    return { warning, error };
}

function updateKcalTotals() {
  const totals = { adults: 0, children: 0 };
  const planDays = { adults: {}, children: {} };

  for (const plannerType of ['adults', 'children']) {
    for (let di = 0; di < DAYS.length; di++) {
      planDays[plannerType][di] = 0;
      for (let mi = 0; mi < MEALS.length; mi++) {
        const item = state.plans[plannerType][key(di, mi)];
        if (item) {
          const portion = (plannerType === 'adults') ? item.portion_adult_g : item.portion_child_g;
          const kcal = (item.kcal100 / 100) * portion;
          planDays[plannerType][di] += kcal;
        }
      }
    }
    const totalKcal = Object.values(planDays[plannerType]).reduce((a, b) => a + b, 0);
    totals[plannerType] = totalKcal > 0 ? Math.round(totalKcal / DAYS.length) : 0;
  }

  els.kcal.adults.textContent = totals.adults;
  els.kcal.children.textContent = totals.children;
}

function buildShoppingList() {
    const list = {};
    const { adults, children } = state;

    if (adults === 0 && children === 0) {
        els.shop.list.innerHTML = '<p>Aggiungi persone per generare la lista.</p>';
        return;
    }

    // Raccoglie tutti gli item dai due piani
    const allItems = [
        ...(adults > 0 ? Object.values(state.plans.adults) : []),
        ...(children > 0 ? Object.values(state.plans.children) : [])
    ].filter(Boolean);

    for (const item of allItems) {
        if (!list[item.id]) {
            list[item.id] = { name: item.name, cat: item.cat, adult_portions: 0, child_portions: 0, total_g: 0 };
        }
    }

    // Conta le porzioni per adulti e bambini
    if(adults > 0) {
        Object.values(state.plans.adults).filter(Boolean).forEach(item => list[item.id].adult_portions++);
    }
    if(children > 0) {
        Object.values(state.plans.children).filter(Boolean).forEach(item => list[item.id].child_portions++);
    }

    // Calcola il totale in grammi
    const dbMap = new Map(DB.map(i => [i.id, i]));
    for (const id in list) {
        const itemInfo = dbMap.get(id);
        if (itemInfo) {
            const adult_qty = list[id].adult_portions * itemInfo.portion_adult_g * adults;
            const child_qty = list[id].child_portions * itemInfo.portion_child_g * children;
            list[id].total_g = adult_qty + child_qty;
        }
    }

    // Raggruppa per categoria
    const byCategory = {};
    for (const id in list) {
        const item = list[id];
        if (!byCategory[item.cat]) {
            byCategory[item.cat] = [];
        }
        if(item.total_g > 0) {
            byCategory[item.cat].push(`- ${item.name}: ${item.total_g}g`);
        }
    }

    // Genera HTML
    const sortedCats = Object.keys(byCategory).sort();
    els.shop.list.innerHTML = sortedCats.map(cat => `
        <h4>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h4>
        <ul>${byCategory[cat].map(line => `<li>${line}</li>`).join('')}</ul>
    `).join('');
}

// =================================================================================
// HELPERS & UTILS
// =================================================================================
function emptyPlan() {
  const plan = {};
  for (let d = 0; d < DAYS.length; d++) {
    for (let m = 0; m < MEALS.length; m++) {
      plan[key(d, m)] = null;
    }
  }
  return plan;
}

const key = (di, mi) => `${di}_${mi}`;
const splitCSV = s => !s ? [] : s.split(',').map(x => x.trim()).filter(Boolean);
const toNum = x => { const n = Number(x); return isFinite(n) ? n : 0; };

const visibleItems = () => DB.filter(item =>
  item.cat === state.activeCat &&
  !item.allergens.some(a => state.filters.exAllergens.has(a))
);

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);

  // Aggiungo uno stile base per il toast se non esiste
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.innerHTML = `
      .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 8px;
        background: #333;
        color: white;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s, bottom 0.3s;
        animation: toast-in 0.5s forwards;
      }
      .toast.info { background: var(--acc); }
      .toast.warn { background: var(--warn); }
      .toast.err { background: var(--err); }
      @keyframes toast-in {
        to { opacity: 1; bottom: 30px; }
      }
    `;
    document.head.appendChild(style);
  }
}

// =================================================================================
// LOCAL STORAGE & IMPORT/EXPORT
// =================================================================================
function saveState() {
  const serializableState = {
    ...state,
    filters: { exAllergens: [...state.filters.exAllergens] },
  };
  localStorage.setItem('mealPlannerState_v2', JSON.stringify(serializableState));
}

function loadState() {
  try {
    const raw = localStorage.getItem('mealPlannerState_v2');
    if (!raw) return null;
    const loadedState = JSON.parse(raw);
    // Sanitize e assicura la coerenza
    loadedState.filters.exAllergens = new Set(loadedState.filters.exAllergens || []);
    loadedState.adults = toNum(loadedState.adults);
    loadedState.children = toNum(loadedState.children);
    if (!loadedState.plans || !loadedState.plans.adults || !loadedState.plans.children) {
        loadedState.plans = { adults: emptyPlan(), children: emptyPlan() };
    }
    return loadedState;
  } catch (e) {
    console.error("Failed to load state from localStorage", e);
    return null;
  }
}

function exportPlan() {
    const payload = JSON.stringify({
        ...state,
        filters: { exAllergens: [...state.filters.exAllergens] }
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meal-plan-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Piano esportato con successo!');
}

function importPlan() {
    const ip = document.createElement('input');
    ip.type = 'file';
    ip.accept = 'application/json';
    ip.onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            try {
                const data = JSON.parse(r.result);
                // Validazione e merge dello stato importato
                const newState = {
                    ...state, // Mantiene lo stato attuale come base
                    ...data,
                    filters: { exAllergens: new Set(data.filters?.exAllergens || []) },
                    adults: toNum(data.adults),
                    children: toNum(data.children),
                    plans: {
                        adults: data.plans?.adults || emptyPlan(),
                        children: data.plans?.children || emptyPlan(),
                    }
                };
                state = newState;
                saveState();
                renderAll();
                toast('Piano importato con successo!');
            } catch (err) {
                toast('File JSON non valido o corrotto.', 'err');
                console.error("Import failed:", err);
            }
        };
        r.readAsText(f);
    };
    ip.click();
}