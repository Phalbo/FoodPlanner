const DAYS = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"]; 
const MEALS = ["Colazione","Spuntino","Pranzo","Cena"]; 
const DEFAULT_ALLERGENS = ["glutine","latticini","uova","crostacei","pesce","arachidi","soia","frutta_a_guscio","sesamo","solfiti","molluschi","nickel"];

let DB = []; // da foods.xml
let CATS = [];

let state = loadState() || { plan: emptyPlan(), filters: {exAllergens: []}, activeCat: null, adults: 1, children: 1 };
state.filters.exAllergens = new Set(state.filters.exAllergens);

const els = {
  planner: document.getElementById('planner'),
  items: document.getElementById('items'),
  tabs: document.getElementById('categoryTabs'),
  allergenFilters: document.getElementById('allergenFilters'),
  visibleCount: document.getElementById('visibleCount'),
  kcalAdult: document.getElementById('kcalAdult'),
  kcalChild: document.getElementById('kcalChild'),
  adults: document.getElementById('adults'),
  children: document.getElementById('children'),
  shopDrawer: document.getElementById('shopDrawer'),
  shopList: document.getElementById('shopList'),
  closeShop: document.getElementById('closeShop'),
  copyShop: document.getElementById('copyShop'),
  downloadShop: document.getElementById('downloadShop'),
};

init();

async function init(){
  try{
    const res = await fetch('foods.xml', {cache:'no-store'});
    if(!res.ok) throw new Error('fetch fail');
    parseXML(await res.text());
  }catch(e){
    const fallback = document.getElementById('foodsFallback')?.textContent?.trim();
    if(fallback) parseXML(fallback);
  }
  CATS = [...new Set(DB.map(x=>x.cat))];
  if(!state.activeCat) state.activeCat = CATS[0] || null;
  renderAll();
}

function parseXML(x){
  const doc = new DOMParser().parseFromString(x, 'application/xml');
  const items = [...doc.querySelectorAll('item')];
  DB = items.map(el=>({
    name: el.getAttribute('name'),
    cat: el.getAttribute('cat'),
    allergens: splitCSV(el.getAttribute('allergens')),
    kcal100: toNum(el.getAttribute('kcal100')),
    portion_adult_g: toNum(el.getAttribute('portion_adult_g')),
    portion_child_g: toNum(el.getAttribute('portion_child_g')),
  }));
}
const splitCSV = s => !s? [] : s.split(',').map(x=>x.trim()).filter(Boolean);
const toNum = x => { const n = Number(x); return isFinite(n)? n : 0; };

function emptyPlan(){ const plan={}; for(let d=0; d<DAYS.length; d++){ for(let m=0; m<MEALS.length; m++){ plan[key(d,m)] = null; } } return plan; }
const key = (di,mi) => `${di}_${mi}`;
function saveState(){ localStorage.setItem('mealPlannerState_v2', JSON.stringify({...state, filters:{exAllergens:[...state.filters.exAllergens]}})); }
function loadState(){ try{ const raw = JSON.parse(localStorage.getItem('mealPlannerState_v2')); return raw||null; }catch(e){ return null; } }

function renderAll(){
  renderAllergenFilters();
  renderTabs();
  renderItems();
  renderGrid();
  bindHeader();
  els.adults.value = state.adults; els.children.value = state.children;
}

function bindHeader(){
  document.getElementById('btnClear').onclick = ()=> {
    if(confirm('Sicuro?')){
      state.plan = emptyPlan();
      saveState();
      renderGrid();
    }
  };

  document.getElementById('btnExport').onclick = ()=> {
    const payload = JSON.stringify({
      ...state,
      // serializza il Set per sicurezza
      filters: { exAllergens: [...state.filters.exAllergens] }
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meal-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('btnImport').onclick = ()=> {
    const ip = document.createElement('input');
    ip.type = 'file';
    ip.accept = 'application/json';
    ip.onchange = (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          const data = JSON.parse(r.result);
          // ripristina il Set
          data.filters = data.filters || {};
          data.filters.exAllergens = new Set(data.filters.exAllergens || []);
          // fallback per campi mancanti
          data.activeCat = data.activeCat || state.activeCat || (CATS[0] || null);
          data.adults = Number(data.adults ?? 1);
          data.children = Number(data.children ?? 1);
          // plan coerente con giorni/pasti correnti
          const plan = emptyPlan();
          if (data.plan && typeof data.plan === 'object'){
            for (const k in plan){ if (data.plan[k]) plan[k] = data.plan[k]; }
          }
          state = { ...state, ...data, plan };
          saveState();
          renderAll();
        }catch(err){
          alert('JSON non valido');
        }
      };
      r.readAsText(f);
    };
    ip.click();
  };

  document.getElementById('btnRandomCategory').onclick = ()=> {
    const pool = visibleItems().filter(x => x.cat === state.activeCat && (typeof canPlace === 'function' ? canPlace(0,0,x) || true : true));
    if(!pool.length){ return alert('Nessun elemento disponibile per questa categoria.'); }
    const pick = pool[Math.floor(Math.random()*pool.length)];
    if (window.toast) toast('🎲 ' + pick.name); else alert('Random: ' + pick.name);
  };

  // Lista della spesa (drawer)
  document.getElementById('btnShop').onclick = ()=> {
    if (typeof buildShoppingList === 'function') buildShoppingList();
    els.shopDrawer.classList.remove('hidden');
  };
  els.closeShop.onclick = ()=> els.shopDrawer.classList.add('hidden');
  els.copyShop.onclick = ()=> {
    if (!els.shopList) return;
    navigator.clipboard.writeText(els.shopList.textContent || '')
      .then(()=> window.toast ? toast('Copiato') : alert('Copiato'))
      .catch(()=> alert('Non riesco a copiare'));
  };
  els.downloadShop.onclick = ()=> {
    const blob = new Blob([els.shopList.textContent || ''], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lista-spesa.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Impostazioni persone
  els.adults.onchange = ()=> {
    state.adults = Math.max(0, Number(els.adults.value) || 0);
    saveState();
    if (typeof updateKcalTotals === 'function') updateKcalTotals();
  };
  els.children.onchange = ()=> {
    state.children = Math.max(0, Number(els.children.value) || 0);
    saveState();
    if (typeof updateKcalTotals === 'function') updateKcalTotals();
  };
}
