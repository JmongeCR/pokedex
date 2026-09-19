// ── Constants ──────────────────────────────────────────────
const TYPE_COLORS = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
  grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
  ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
  rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746',
  steel: '#B7B7CE', fairy: '#D685AD',
};
const TYPE_ES = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico',
  grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno',
  ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
  rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro',
  steel: 'Acero', fairy: 'Hada',
};
const STAT_LABELS = {
  hp: 'HP', attack: 'ATQ', defense: 'DEF',
  'special-attack': 'A.ESP', 'special-defense': 'D.ESP', speed: 'VEL',
};
const STAT_COLORS = {
  hp: '#FF5959', attack: '#F5AC78', defense: '#FAE078',
  'special-attack': '#9DB7F5', 'special-defense': '#A7DB8D', speed: '#FA92B2',
};

const API = 'https://pokeapi.co/api/v2';
const artURL = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const sprURL = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// ── State ──────────────────────────────────────────────────
const cache = new Map();
let allPokemon = [];
let filtered = [];
let activeType = 'all';
let searchQuery = '';
let currentPage = 0;
const PAGE_SIZE = 24;

// ── Fetch helper ───────────────────────────────────────────
async function apiFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

// ── Load generation ────────────────────────────────────────
async function loadGeneration(offset, limit) {
  showSkeletons(Math.min(PAGE_SIZE, limit));
  document.getElementById('infoBar').textContent = '';
  try {
    const data = await apiFetch(`${API}/pokemon?limit=${limit}&offset=${offset}`);
    allPokemon = data.results.map(p => ({
      id: parseInt(p.url.split('/').filter(Boolean).pop()),
      name: p.name,
    }));
    applyFilters();
  } catch (err) {
    document.getElementById('grid').innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚠️</div>
        <p>Error al conectar con la API</p>
        <small>Verifica tu conexión a internet</small>
      </div>`;
    document.getElementById('lmw').hidden = true;
  }
}

// ── Filtering ──────────────────────────────────────────────
function applyFilters() {
  let list = [...allPokemon];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || String(p.id).includes(q));
  }

  if (activeType !== 'all') {
    const typeIds = cache.get(`type:${activeType}`);
    if (typeIds) {
      list = list.filter(p => typeIds.has(p.id));
    }
  }

  filtered = list;
  currentPage = 0;
  renderPage(true);
}

// ── Skeletons ──────────────────────────────────────────────
function showSkeletons(n) {
  document.getElementById('grid').innerHTML = Array(n).fill(0).map(() => `
    <div class="skel">
      <div class="skel-top"></div>
      <div class="skel-bot">
        <div class="sk-l"></div>
        <div class="sk-l"></div>
      </div>
    </div>`).join('');
  document.getElementById('lmw').hidden = true;
}

// ── Render grid page ───────────────────────────────────────
async function renderPage(reset) {
  const grid = document.getElementById('grid');

  if (reset) {
    grid.innerHTML = '';
    currentPage = 0;
  }

  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filtered.length);
  const slice = filtered.slice(start, end);

  if (reset && slice.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <p>No se encontraron Pokémon</p>
        <small>Prueba con otro nombre o tipo</small>
      </div>`;
    document.getElementById('lmw').hidden = true;
    updateInfoBar();
    return;
  }

  // Insert placeholder skeletons
  const frag = document.createDocumentFragment();
  slice.forEach(p => {
    const el = document.createElement('div');
    el.className = 'skel';
    el.id = `pk_${p.id}`;
    el.innerHTML = `<div class="skel-top"></div><div class="skel-bot"><div class="sk-l"></div><div class="sk-l"></div></div>`;
    frag.appendChild(el);
  });
  grid.appendChild(frag);

  // Fetch & render each card
  await Promise.all(slice.map(async p => {
    try {
      const d = await apiFetch(`${API}/pokemon/${p.id}`);
      const el = document.getElementById(`pk_${p.id}`);
      if (!el) return;

      const primaryType = d.types[0].type.name;
      const color = TYPE_COLORS[primaryType] || '#888';

      el.className = 'card';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Ver detalles de ${p.name}`);
      el.innerHTML = `
        <div class="c-top">
          <div class="c-bg" style="background: linear-gradient(145deg, ${color}dd, ${color}88)"></div>
          <div class="c-deco"></div>
          <div class="c-deco2"></div>
          <div class="c-num">#${String(p.id).padStart(3, '0')}</div>
          <img class="c-art"
            src="${artURL(p.id)}"
            alt="${p.name}"
            loading="lazy"
            onerror="this.src='${sprURL(p.id)}'">
        </div>
        <div class="c-bottom">
          <div class="c-name">${p.name}</div>
          <div class="c-types">
            ${d.types.map(t => `<span class="tbadge" style="background:${TYPE_COLORS[t.type.name] || '#888'}">${TYPE_ES[t.type.name] || t.type.name}</span>`).join('')}
          </div>
        </div>
      `;
      el.addEventListener('click', () => openModal(p.id));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p.id); }
      });
    } catch {
      document.getElementById(`pk_${p.id}`)?.remove();
    }
  }));

  // Load more button visibility
  const hasMore = (currentPage + 1) * PAGE_SIZE < filtered.length;
  const lmw = document.getElementById('lmw');
  lmw.hidden = !hasMore;
  document.getElementById('btnMore').disabled = false;

  updateInfoBar();
}

function updateInfoBar() {
  const bar = document.getElementById('infoBar');
  const shown = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);
  bar.innerHTML = `
    <span class="pill">${filtered.length} Pokémon</span>
    ${activeType !== 'all' ? `<span class="pill" style="background:${TYPE_COLORS[activeType]}22;color:${TYPE_COLORS[activeType]}">${TYPE_ES[activeType]}</span>` : ''}
    ${searchQuery ? `<span class="pill">«${searchQuery}»</span>` : ''}
  `;
}

// ── Modal ──────────────────────────────────────────────────
async function openModal(id) {
  const bdrop = document.getElementById('bdrop');
  const mbox = document.getElementById('mbox');

  bdrop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => bdrop.classList.add('vis')));
  mbox.innerHTML = `<div class="spin-wrap"><div class="spinner"></div><span class="spin-txt">Cargando...</span></div>`;

  try {
    const d = await apiFetch(`${API}/pokemon/${id}`);
    let species = null;
    try { species = await apiFetch(d.species.url); } catch {}

    const genus = (species?.genera?.find(g => g.language.name === 'es')
      || species?.genera?.find(g => g.language.name === 'en'))?.genus || '';

    const desc = (species?.flavor_text_entries?.find(e => e.language.name === 'es')
      || species?.flavor_text_entries?.find(e => e.language.name === 'en'))
      ?.flavor_text?.replace(/[\f\n]/g, ' ') || '';

    const primaryType = d.types[0].type.name;
    const color = TYPE_COLORS[primaryType] || '#888';
    const totalStats = d.stats.reduce((s, x) => s + x.base_stat, 0);

    mbox.innerHTML = `
      <div class="m-hero">
        <div class="m-bg" style="background: linear-gradient(160deg, ${color}f0, ${color}99)"></div>
        <div class="m-ring"></div>
        <div class="m-ring2"></div>
        <button class="m-close" id="mClose" aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="m-id">#${String(id).padStart(3, '0')}</div>
        <img class="m-art" src="${artURL(id)}" alt="${d.name}" onerror="this.src='${sprURL(id)}'">
        <div class="m-bds">
          ${d.types.map(t => `<span class="m-badge" style="background:${TYPE_COLORS[t.type.name] || '#888'}">${TYPE_ES[t.type.name] || t.type.name}</span>`).join('')}
        </div>
      </div>
      <div class="m-body">
        <div class="m-name">${d.name}</div>
        ${genus ? `<div class="m-genus">${genus}</div>` : ''}
        ${desc ? `<div class="m-desc" style="border-color:${color}">${desc}</div>` : ''}

        <div class="m-grid">
          <div class="m-cell">
            <div class="m-label">Altura</div>
            <div class="m-val">${(d.height / 10).toFixed(1)} m</div>
          </div>
          <div class="m-cell">
            <div class="m-label">Peso</div>
            <div class="m-val">${(d.weight / 10).toFixed(1)} kg</div>
          </div>
          <div class="m-cell">
            <div class="m-label">Exp. base</div>
            <div class="m-val">${d.base_experience ?? '—'}</div>
          </div>
          <div class="m-cell">
            <div class="m-label">Total</div>
            <div class="m-val" style="color:${color}">${totalStats}</div>
          </div>
        </div>

        <div class="sec-title">Habilidades</div>
        <div class="abil-list">
          ${d.abilities.map(a => `
            <span class="abil${a.is_hidden ? ' hidden' : ''}">
              ${a.ability.name.replace(/-/g, ' ')}
              ${a.is_hidden ? '<small style="opacity:.65"> (oculta)</small>' : ''}
            </span>`).join('')}
        </div>

        <div class="sec-title">Estadísticas base</div>
        ${d.stats.map(s => {
          const pct = Math.min(100, Math.round(s.base_stat / 255 * 100));
          const col = STAT_COLORS[s.stat.name] || color;
          return `
            <div class="stat-row">
              <span class="stat-name">${STAT_LABELS[s.stat.name] || s.stat.name}</span>
              <span class="stat-val">${s.base_stat}</span>
              <div class="stat-track">
                <div class="stat-fill" style="width:${pct}%; background:${col}"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;

    document.getElementById('mClose').addEventListener('click', closeModal);

  } catch {
    mbox.innerHTML = `<div class="spin-wrap"><p style="color:var(--muted); font-weight:600">No se pudo cargar este Pokémon</p></div>`;
  }
}

function closeModal() {
  const bdrop = document.getElementById('bdrop');
  bdrop.classList.remove('vis');
  setTimeout(() => { bdrop.hidden = true; }, 260);
}

// ── Type chips ─────────────────────────────────────────────
function buildTypeChips() {
  const bar = document.getElementById('tbar');

  function makeChip(label, type, color) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (type === 'all' ? ' on' : '');
    btn.dataset.type = type;
    btn.innerHTML = `<span class="dot" style="${type !== 'all' ? `background:${color}` : ''}"></span>${label}`;
    if (type === 'all') {
      btn.style.background = '#6b7080';
      btn.style.borderColor = 'transparent';
      btn.style.color = '#fff';
    }

    btn.addEventListener('click', async () => {
      if (activeType === type) return; // already selected

      // Update chip UI
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.remove('on');
        c.style.background = '';
        c.style.borderColor = '';
        c.style.color = '';
      });
      btn.classList.add('on');
      btn.style.background = color;
      btn.style.borderColor = 'transparent';
      btn.style.color = type === 'all' ? '#fff' : '#fff';

      activeType = type;

      // Fetch type pokemon list if not cached
      if (type !== 'all' && !cache.has(`type:${type}`)) {
        showSkeletons(PAGE_SIZE);
        try {
          const td = await apiFetch(`${API}/type/${type}`);
          const ids = new Set(td.pokemon.map(p =>
            parseInt(p.pokemon.url.split('/').filter(Boolean).pop())
          ));
          cache.set(`type:${type}`, ids);
        } catch {
          // silently fail - will show all pokemon
        }
      }

      applyFilters();
    });

    bar.appendChild(btn);
  }

  makeChip('Todos', 'all', '#6b7080');
  Object.entries(TYPE_ES).forEach(([key, label]) =>
    makeChip(label, key, TYPE_COLORS[key] || '#888')
  );
}

// ── Event listeners ────────────────────────────────────────
let searchTimer;
document.getElementById('srch').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = e.target.value.trim();
    applyFilters();
  }, 250);
});

document.getElementById('gs').addEventListener('change', e => {
  const [offset, limit] = e.target.value.split(',').map(Number);

  // Reset state
  activeType = 'all';
  searchQuery = '';
  document.getElementById('srch').value = '';

  // Reset chip UI
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.remove('on');
    c.style.background = '';
    c.style.borderColor = '';
    c.style.color = '';
  });
  const allChip = document.querySelector('.chip[data-type="all"]');
  allChip.classList.add('on');
  allChip.style.background = '#6b7080';
  allChip.style.borderColor = 'transparent';
  allChip.style.color = '#fff';

  loadGeneration(offset, limit);
});

document.getElementById('btnMore').addEventListener('click', () => {
  document.getElementById('btnMore').disabled = true;
  currentPage++;
  renderPage(false);
});

document.getElementById('bdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('bdrop')) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('bdrop').hidden) closeModal();
});

// ── Theme toggle ───────────────────────────────────────────
function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.getElementById('iconSun').style.display = dark ? 'none' : 'block';
  document.getElementById('iconMoon').style.display = dark ? 'block' : 'none';
  try { localStorage.setItem('pkdx-theme', dark ? 'dark' : 'light'); } catch {}
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem('pkdx-theme'); } catch {}
  applyTheme(saved ? saved === 'dark' : isDark());
}

document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(!isDark());
});

// ── Init ───────────────────────────────────────────────────
initTheme();
buildTypeChips();
loadGeneration(0, 151);

// ── Service Worker ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Install banner ─────────────────────────────────────────
let deferredPrompt = null;

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-inner">
      <div class="install-icon">⚡</div>
      <div class="install-text">
        <strong>Instalar Pokédex</strong>
        <span>Accede sin conexión desde tu pantalla de inicio</span>
      </div>
      <button class="install-ok" id="installOk">Instalar</button>
      <button class="install-x" id="installX" aria-label="Cerrar">✕</button>
    </div>`;
  document.body.appendChild(banner);

  document.getElementById('installOk').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') banner.remove();
    deferredPrompt = null;
  });
  document.getElementById('installX').addEventListener('click', () => {
    banner.remove();
    try { localStorage.setItem('pkdx-install-dismissed', '1'); } catch {}
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  try {
    if (!localStorage.getItem('pkdx-install-dismissed')) showInstallBanner();
  } catch { showInstallBanner(); }
});

window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('installBanner');
  if (banner) banner.remove();
  deferredPrompt = null;
});

// ── Online/offline indicator ───────────────────────────────
function showOfflineToast(offline) {
  const existing = document.getElementById('offlineToast');
  if (offline) {
    if (existing) return;
    const t = document.createElement('div');
    t.id = 'offlineToast';
    t.className = 'offline-toast';
    t.innerHTML = '📡 Sin conexión — datos del caché';
    document.body.appendChild(t);
  } else {
    if (existing) existing.remove();
  }
}
window.addEventListener('offline', () => showOfflineToast(true));
window.addEventListener('online', () => showOfflineToast(false));
