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
const idFromUrl = url => parseInt(url.split('/').filter(Boolean).pop());

// ── State ──────────────────────────────────────────────────
const cache = new Map();
let allPokemon = [];
let filtered = [];
let activeType = 'all';
let searchQuery = '';
let currentPage = 0;
const PAGE_SIZE = 24;

let favorites = new Set();
let showFavsOnly = false;

let modalToken = 0;
let lastFocusedElement = null;
let savedScrollY = 0;
let focusTrapHandler = null;

// ── Favorites ──────────────────────────────────────────────
function loadFavorites() {
  try {
    const raw = localStorage.getItem('pkdx-favs');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) favorites = new Set(arr.filter(x => Number.isInteger(x)));
    }
  } catch {}
}

function saveFavorites() {
  try { localStorage.setItem('pkdx-favs', JSON.stringify([...favorites])); } catch {}
}

function toggleFav(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  updateFavUI(id);
}

function updateFavsToggle() {
  const badge = document.getElementById('favsCount');
  const mfc = document.getElementById('mobileFilterCount');
  const n = favorites.size;
  if (badge) { badge.textContent = n; badge.hidden = n === 0; }
  if (mfc) { mfc.textContent = n; mfc.hidden = n === 0; }
}

function updateFavUI(id) {
  const isFav = favorites.has(id);

  const cardBtn = document.querySelector(`.c-fav[data-id="${id}"]`);
  if (cardBtn) {
    cardBtn.setAttribute('aria-pressed', String(isFav));
    cardBtn.setAttribute('aria-label', isFav ? 'Quitar de favoritos' : 'Guardar como favorito');
    cardBtn.textContent = isFav ? '♥' : '♡';
    cardBtn.classList.toggle('fav-on', isFav);
  }

  const mBtn = document.getElementById('mFavBtn');
  if (mBtn && parseInt(mBtn.dataset.id) === id) {
    mBtn.setAttribute('aria-pressed', String(isFav));
    mBtn.classList.toggle('fav-on', isFav);
    mBtn.innerHTML = isFav ? '♥ Guardado' : '♡ Guardar';
  }

  updateFavsToggle();
  if (showFavsOnly) applyFilters();
}

function clearAllFilters() {
  activeType = 'all';
  searchQuery = '';
  showFavsOnly = false;
  document.getElementById('srch').value = '';

  document.querySelectorAll('.type-pill').forEach(p => {
    p.classList.remove('is-active'); p.setAttribute('aria-pressed', 'false');
  });
  const allPill = document.querySelector('.type-pill[data-type="all"]');
  if (allPill) { allPill.classList.add('is-active'); allPill.setAttribute('aria-pressed', 'true'); }

  const btnExplore = document.getElementById('btnExplore');
  const btnFavs    = document.getElementById('btnFavs');
  if (btnExplore) { btnExplore.classList.add('is-active');    btnExplore.setAttribute('aria-pressed', 'true'); }
  if (btnFavs)    { btnFavs.classList.remove('is-active');    btnFavs.setAttribute('aria-pressed', 'false'); }

  applyFilters();
}

// ── URL routing ────────────────────────────────────────────
function getPokemonIdFromUrl() {
  const v = new URLSearchParams(location.search).get('p');
  const n = parseInt(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

window.addEventListener('popstate', () => {
  const id = getPokemonIdFromUrl();
  if (id) {
    openModal(id, { skipHistory: true });
  } else if (!document.getElementById('bdrop').hidden) {
    closeModalDOM();
  }
});

// ── Fetch helper ───────────────────────────────────────────
async function apiFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

// Resolve Spanish (fallback English) name for an ability
async function resolveAbilityName(ability) {
  try {
    const data = await apiFetch(ability.url);
    return (data.names.find(n => n.language.name === 'es')
      || data.names.find(n => n.language.name === 'en'))?.name
      || ability.name.replace(/-/g, ' ');
  } catch {
    return ability.name.replace(/-/g, ' ');
  }
}

// ── Scroll lock (iOS-safe) ─────────────────────────────────
function lockScroll() {
  savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = '100%';
}

function unlockScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo({ top: savedScrollY, behavior: 'instant' });
}

// ── Focus trap ─────────────────────────────────────────────
function installFocusTrap(el) {
  removeFocusTrap();
  focusTrapHandler = e => {
    if (e.key !== 'Tab') return;
    const nodes = [...el.querySelectorAll(
      'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])'
    )].filter(n => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  el.addEventListener('keydown', focusTrapHandler);
}

function removeFocusTrap() {
  if (focusTrapHandler) {
    document.getElementById('mbox')?.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, duration = 2400) {
  document.getElementById('appToast')?.remove();
  const t = document.createElement('div');
  t.id = 'appToast';
  t.className = 'app-toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('toast-show')));
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.className = 'update-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span>Nueva versión disponible</span>
    <button id="updateReload">Actualizar</button>
    <button id="updateDismiss" aria-label="Descartar">✕</button>
  `;
  document.body.appendChild(el);
  document.getElementById('updateReload').addEventListener('click', () => location.reload());
  document.getElementById('updateDismiss').addEventListener('click', () => el.remove());
}

// ── Load generation ────────────────────────────────────────
async function loadGeneration(offset, limit) {
  showSkeletons(Math.min(PAGE_SIZE, limit));
  document.getElementById('infoBar').textContent = '';
  try {
    const data = await apiFetch(`${API}/pokemon?limit=${limit}&offset=${offset}`);
    allPokemon = data.results.map(p => ({
      id: idFromUrl(p.url),
      name: p.name,
    }));
    applyFilters();
  } catch {
    document.getElementById('grid').innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚠️</div>
        <p>No se pudo conectar con la API</p>
        <small>Verifica tu conexión a internet</small>
      </div>`;
    document.getElementById('pgn').hidden = true;
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
    if (typeIds) list = list.filter(p => typeIds.has(p.id));
  }

  if (showFavsOnly) list = list.filter(p => favorites.has(p.id));

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
  document.getElementById('pgn').hidden = true;
}

// ── Pagination ─────────────────────────────────────────────
function renderPagination() {
  const pgn = document.getElementById('pgn');
  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (totalPages <= 1) { pgn.hidden = true; return; }
  pgn.hidden = false;

  const cur = currentPage;
  const pages = [];

  const show = new Set([0, totalPages - 1]);
  for (let i = Math.max(0, cur - 2); i <= Math.min(totalPages - 1, cur + 2); i++) show.add(i);
  const sorted = [...show].sort((a, b) => a - b);

  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) pages.push('…');
    pages.push(p);
  });

  pgn.innerHTML = `
    <button class="pg-btn pg-prev" ${cur === 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    <div class="pg-nums">
      ${pages.map(p => p === '…'
        ? `<span class="pg-ellipsis">…</span>`
        : `<button class="pg-num${p === cur ? ' pg-active' : ''}" data-p="${p}">${p + 1}</button>`
      ).join('')}
    </div>
    <button class="pg-btn pg-next" ${cur === totalPages - 1 ? 'disabled' : ''} aria-label="Página siguiente">›</button>
  `;

  pgn.querySelector('.pg-prev').addEventListener('click', () => goPage(cur - 1));
  pgn.querySelector('.pg-next').addEventListener('click', () => goPage(cur + 1));
  pgn.querySelectorAll('.pg-num').forEach(btn => {
    btn.addEventListener('click', () => goPage(parseInt(btn.dataset.p)));
  });
}

function goPage(n) {
  currentPage = n;
  document.getElementById('grid').innerHTML = '';
  renderPage(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const hasSearch  = !!searchQuery;
    const hasType    = activeType !== 'all';
    const activeFilters = [
      hasSearch && `«${searchQuery}»`,
      hasType   && TYPE_ES[activeType],
    ].filter(Boolean).join(' + ');

    if (showFavsOnly && favorites.size === 0) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">♡</div>
          <p>Aún no tienes favoritos</p>
          <small>Toca ♡ en cualquier tarjeta para guardar un Pokémon</small>
        </div>`;
    } else if (showFavsOnly && filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">🔍</div>
          <p>Ningún favorito coincide con los filtros activos</p>
          <small>${activeFilters ? `Filtros: ${activeFilters}` : ''}</small>
          <button class="btn-clear-filters">Limpiar filtros</button>
        </div>`;
      grid.querySelector('.btn-clear-filters').addEventListener('click', clearAllFilters);
    } else {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">🔍</div>
          <p>No se encontraron Pokémon</p>
          <small>${activeFilters ? `Filtros activos: ${activeFilters}` : 'Prueba con otro nombre o tipo'}</small>
          ${activeFilters ? '<button class="btn-clear-filters">Limpiar filtros</button>' : ''}
        </div>`;
      grid.querySelector('.btn-clear-filters')?.addEventListener('click', clearAllFilters);
    }
    document.getElementById('pgn').hidden = true;
    updateInfoBar();
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach(p => {
    const el = document.createElement('div');
    el.className = 'skel';
    el.id = `pk_${p.id}`;
    el.innerHTML = `<div class="skel-top"></div><div class="skel-bot"><div class="sk-l"></div><div class="sk-l"></div></div>`;
    frag.appendChild(el);
  });
  grid.appendChild(frag);

  await Promise.all(slice.map(async p => {
    try {
      const d = await apiFetch(`${API}/pokemon/${p.id}`);
      const el = document.getElementById(`pk_${p.id}`);
      if (!el) return;

      const primaryType = d.types[0].type.name;
      const color = TYPE_COLORS[primaryType] || '#888';
      const isFav = favorites.has(p.id);

      el.className = 'card';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Ver detalles de ${p.name}`);
      el.innerHTML = `
        <div class="c-header">
          <span class="c-num">#${String(p.id).padStart(3, '0')}</span>
          <button class="fav-btn c-fav${isFav ? ' fav-on' : ''}"
            data-id="${p.id}"
            aria-pressed="${isFav}"
            aria-label="${isFav ? 'Quitar de favoritos' : 'Guardar como favorito'}">${isFav ? '♥' : '♡'}</button>
        </div>
        <div class="c-art-zone">
          <div class="c-circle" style="--cc-soft:${color}20"></div>
          <img class="c-art"
            src="${artURL(p.id)}"
            alt="${p.name}"
            loading="lazy"
            onerror="this.src='${sprURL(p.id)}'">
        </div>
        <div class="c-body">
          <div class="c-name">${p.name}</div>
          <div class="c-types">
            ${d.types.map(t => {
              const tc = TYPE_COLORS[t.type.name] || '#888';
              return `<span class="tbadge" style="--tc:${tc}; --tc-bg:${tc}22">${TYPE_ES[t.type.name] || t.type.name}</span>`;
            }).join('')}
          </div>
        </div>
      `;

      el.querySelector('.c-fav').addEventListener('click', e => {
        e.stopPropagation();
        toggleFav(p.id);
      });
      el.addEventListener('click', () => openModal(p.id));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p.id); }
      });
    } catch {
      document.getElementById(`pk_${p.id}`)?.remove();
    }
  }));

  renderPagination();
  updateInfoBar();
}

function updateInfoBar() {
  const bar = document.getElementById('infoBar');
  const favCount = favorites.size;
  bar.innerHTML = `
    <span class="rb-count">${filtered.length} Pokémon</span>
    ${activeType !== 'all' ? `<span class="rb-tag" style="background:${TYPE_COLORS[activeType]}18;color:${TYPE_COLORS[activeType]}">${TYPE_ES[activeType]}</span>` : ''}
    ${searchQuery ? `<span class="rb-tag">«${searchQuery}»</span>` : ''}
    ${showFavsOnly ? `<span class="rb-tag rb-tag-fav">♥ ${favCount} favorito${favCount !== 1 ? 's' : ''}</span>` : ''}
  `;
}

// ── Evolution ──────────────────────────────────────────────
function evoConditionLabel(details) {
  if (!details?.length) return null;
  const d = details[0];
  const t = d.trigger?.name;

  if (t === 'level-up') {
    if (d.min_level) {
      let label = `Nivel ${d.min_level}`;
      if (d.time_of_day === 'day') label += ' (día)';
      else if (d.time_of_day === 'night') label += ' (noche)';
      if (d.held_item?.name) label += `\n${d.held_item.name.replace(/-/g, ' ')}`;
      return label;
    }
    if (d.min_happiness) {
      if (d.time_of_day === 'day') return 'Amistad (día)';
      if (d.time_of_day === 'night') return 'Amistad (noche)';
      return 'Amistad';
    }
    if (d.min_affection) return 'Cariño';
    if (d.known_move_type?.name) return `Mov. tipo ${TYPE_ES[d.known_move_type.name] || d.known_move_type.name}`;
    if (d.known_move?.name) return `Con ${d.known_move.name.replace(/-/g, ' ')}`;
    if (d.location?.name) return `En ${d.location.name.replace(/-/g, ' ')}`;
    if (d.held_item?.name) return `Llevar ${d.held_item.name.replace(/-/g, ' ')}`;
    if (d.min_beauty) return `Belleza ${d.min_beauty}`;
    if (d.needs_overworld_rain) return 'Bajo lluvia';
    if (d.turn_upside_down) return 'Boca abajo';
    if (d.relative_physical_stats === 1) return 'ATQ > DEF';
    if (d.relative_physical_stats === -1) return 'DEF > ATQ';
    if (d.relative_physical_stats === 0) return 'ATQ = DEF';
    if (d.time_of_day === 'day') return 'Subir nivel (día)';
    if (d.time_of_day === 'night') return 'Subir nivel (noche)';
    return 'Subir nivel';
  }
  if (t === 'use-item') return d.item?.name?.replace(/-/g, ' ') || 'Usar objeto';
  if (t === 'trade') {
    if (d.held_item?.name) return `Intercambio\n${d.held_item.name.replace(/-/g, ' ')}`;
    if (d.trade_species?.name) return `Intercambio c/\n${d.trade_species.name}`;
    return 'Intercambio';
  }
  if (t === 'shed') return 'Muda';
  if (t === 'spin') return 'Dar vueltas';
  if (t === 'tower-of-darkness') return 'Torre Siniestra';
  if (t === 'tower-of-waters') return 'Torre del Agua';
  if (t === 'three-critical-hits') return '3 críticos';
  if (t === 'take-damage') return 'Recibir daño';
  if (t === 'agile-style-move') return 'Mov. ágil';
  if (t === 'strong-style-move') return 'Mov. fuerte';
  if (t === 'other') return null;
  return t?.replace(/-/g, ' ') || null;
}

function chainNodeCount(node) {
  return 1 + node.evolves_to.reduce((s, e) => s + chainNodeCount(e), 0);
}

function renderEvoNode(chain, currentId) {
  const id = idFromUrl(chain.species.url);
  const isCurrent = id === currentId;
  const name = chain.species.name;

  const btn = `<button class="evo-btn${isCurrent ? ' evo-current' : ''}"
    data-evo-id="${id}"
    ${isCurrent ? 'disabled aria-current="true" aria-label="Pokémon actual"' : `aria-label="Abrir ${name}"`}>
    <img src="${sprURL(id)}" alt="${name}" width="56" height="56"
      onerror="this.style.opacity='0'">
    <span class="evo-name">${name}</span>
  </button>`;

  if (chain.evolves_to.length === 0) {
    return `<div class="evo-node">${btn}</div>`;
  }

  if (chain.evolves_to.length === 1) {
    const next = chain.evolves_to[0];
    const cond = evoConditionLabel(next.evolution_details);
    return `<div class="evo-node">${btn}</div>
    <div class="evo-arrow-wrap" aria-hidden="true">
      ${cond ? `<span class="evo-cond">${cond}</span>` : ''}
      <span class="evo-arr">›</span>
    </div>
    ${renderEvoNode(next, currentId)}`;
  }

  // Branching (Eevee, Tyrogue, Wurmple, etc.)
  const branches = chain.evolves_to.map(next => {
    const cond = evoConditionLabel(next.evolution_details);
    return `<div class="evo-branch">
      <div class="evo-arrow-wrap" aria-hidden="true">
        ${cond ? `<span class="evo-cond">${cond}</span>` : ''}
        <span class="evo-arr">›</span>
      </div>
      ${renderEvoNode(next, currentId)}
    </div>`;
  }).join('');

  return `<div class="evo-node">${btn}</div>
  <div class="evo-splits">${branches}</div>`;
}

async function loadEvolutionSection(species, currentId, token) {
  const getEl = () => document.getElementById('evoSection');
  const el = getEl();
  if (!el) return;

  if (!species?.evolution_chain?.url) {
    if (token === modalToken) el.innerHTML = `<p class="evo-none">Sin datos de evolución</p>`;
    return;
  }

  try {
    const chainData = await apiFetch(species.evolution_chain.url);
    if (token !== modalToken) return;
    const cont = getEl();
    if (!cont) return;

    if (chainNodeCount(chainData.chain) <= 1) {
      cont.innerHTML = `<p class="evo-none">No evoluciona</p>`;
      return;
    }

    cont.innerHTML = `<div class="evo-chain" role="group" aria-label="Cadena evolutiva">${renderEvoNode(chainData.chain, currentId)}</div>`;

    cont.querySelectorAll('.evo-btn[data-evo-id]:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => openModal(parseInt(btn.dataset.evoId)));
    });

  } catch {
    if (token !== modalToken) return;
    const cont = getEl();
    if (!cont) return;
    const offlineHint = !navigator.onLine ? 'Sin conexión. ' : '';
    cont.innerHTML = `<p class="evo-none evo-error">${offlineHint}No se pudo cargar la cadena evolutiva. <button class="evo-retry">Reintentar</button></p>`;
    cont.querySelector('.evo-retry').addEventListener('click', () => {
      cont.innerHTML = `<div class="spin-wrap-sm"><div class="spinner-sm"></div></div>`;
      loadEvolutionSection(species, currentId, modalToken);
    });
  }
}

// ── Modal ──────────────────────────────────────────────────
async function openModal(id, opts = {}) {
  const token = ++modalToken;
  const bdrop = document.getElementById('bdrop');
  const mbox  = document.getElementById('mbox');

  const wasOpen = !bdrop.hidden;
  if (!wasOpen) {
    lastFocusedElement = document.activeElement;
    lockScroll();
  }

  bdrop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => bdrop.classList.add('vis')));
  mbox.innerHTML = `<div class="spin-wrap"><div class="spinner"></div><span class="spin-txt">Cargando…</span></div>`;

  if (opts.skipHistory !== true) {
    if (!wasOpen) {
      // First open from list: push a history entry (Back will close the modal)
      history.pushState({ pkdx: true, pokemonId: id }, '', '?p=' + id);
    } else {
      // Evolution navigation: replace current entry so closing goes to the list, not prev Pokémon
      history.replaceState({ pkdx: history.state?.pkdx ?? false, pokemonId: id }, '', '?p=' + id);
    }
  }

  try {
    const d = await apiFetch(`${API}/pokemon/${id}`);
    if (token !== modalToken) return;

    let species = null;
    try { species = await apiFetch(d.species.url); } catch {}
    if (token !== modalToken) return;

    // Fetch Spanish ability names (parallel, cached)
    const abilNames = await Promise.all(
      d.abilities.map(a => resolveAbilityName(a.ability))
    );
    if (token !== modalToken) return;

    const genus = (species?.genera?.find(g => g.language.name === 'es')
      || species?.genera?.find(g => g.language.name === 'en'))?.genus || '';

    const desc = (species?.flavor_text_entries?.find(e => e.language.name === 'es')
      || species?.flavor_text_entries?.find(e => e.language.name === 'en'))
      ?.flavor_text?.replace(/[\f\n\r­’]/g, ' ').replace(/\s+/g, ' ').trim() || '';

    const primaryType = d.types[0].type.name;
    const color = TYPE_COLORS[primaryType] || '#888';
    const totalStats = d.stats.reduce((s, x) => s + x.base_stat, 0);
    const isFav = favorites.has(id);

    mbox.innerHTML = `
      <div class="m-visual" style="--mv-color:${color}">
        <button class="m-close" id="mClose" aria-label="Cerrar ficha">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="m-art-zone">
          <div class="m-circle" style="background:${color}22"></div>
          <img class="m-art" src="${artURL(id)}" alt="${d.name}" onerror="this.src='${sprURL(id)}'">
        </div>
        <div class="m-id">#${String(id).padStart(3, '0')}</div>
        <div class="m-name">${d.name}</div>
        ${genus ? `<div class="m-genus">${genus}</div>` : ''}
        <div class="m-types">
          ${d.types.map(t => {
            const tc = TYPE_COLORS[t.type.name] || '#888';
            return `<span class="tbadge" style="--tc:${tc}; --tc-bg:${tc}22">${TYPE_ES[t.type.name] || t.type.name}</span>`;
          }).join('')}
        </div>
        <div class="m-actions">
          <button class="m-fav${isFav ? ' fav-on' : ''}" id="mFavBtn" data-id="${id}"
            aria-pressed="${isFav}"
            aria-label="${isFav ? 'Quitar de favoritos' : 'Guardar como favorito'}">
            ${isFav ? '♥ Guardado' : '♡ Guardar'}
          </button>
          <button class="share-btn" id="mShareBtn" aria-label="Compartir enlace de ${d.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Compartir
          </button>
        </div>
      </div>

      <div class="m-info">
        ${desc ? `<div class="m-desc" style="--desc-color:${color}">${desc}</div>` : ''}

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
            <div class="m-label">Total stats</div>
            <div class="m-val" style="color:${color}">${totalStats}</div>
          </div>
        </div>

        <div class="m-section">
          <div class="sec-title">Habilidades</div>
          <div class="abil-list">
            ${d.abilities.map((a, i) => `
              <span class="abil${a.is_hidden ? ' hidden' : ''}">
                ${abilNames[i]}
                ${a.is_hidden ? '<span class="abil-hidden-tag">oculta</span>' : ''}
              </span>`).join('')}
          </div>
        </div>

        <div class="m-section">
          <div class="sec-title">Estadísticas base</div>
          ${d.stats.map(s => {
            const pct = Math.min(100, Math.round(s.base_stat / 255 * 100));
            const col = STAT_COLORS[s.stat.name] || color;
            return `
              <div class="stat-row">
                <span class="stat-name">${STAT_LABELS[s.stat.name] || s.stat.name}</span>
                <span class="stat-val">${s.base_stat}</span>
                <div class="stat-track">
                  <div class="stat-fill" style="width:${pct}%;background:${col}"></div>
                </div>
              </div>`;
          }).join('')}
        </div>

        <div class="m-section">
          <div class="sec-title">Evolución</div>
          <div id="evoSection">
            <div class="spin-wrap-sm"><div class="spinner-sm"></div></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mFavBtn').addEventListener('click', () => toggleFav(id));
    document.getElementById('mShareBtn').addEventListener('click', () => sharePokemon(id, d.name));

    installFocusTrap(document.getElementById('mbox'));
    document.getElementById('mClose').focus();

    loadEvolutionSection(species, id, token);

  } catch {
    if (token !== modalToken) return;
    mbox.innerHTML = `<div class="spin-wrap">
      <p style="color:var(--muted);font-weight:700;text-align:center">No se pudo cargar este Pokémon</p>
      ${!navigator.onLine ? '<small style="color:var(--muted)">Verifica tu conexión a internet</small>' : ''}
      <button class="evo-retry" style="margin-top:8px" onclick="openModal(${id})">Reintentar</button>
    </div>`;
  }
}

function closeModal() {
  // If we own the current history entry, pop it (popstate → closeModalDOM)
  if (history.state?.pkdx) {
    history.back();
    return;
  }
  // Direct link or replace-only entry: clean URL without adding history
  const url = new URL(location.href);
  url.searchParams.delete('p');
  history.replaceState({}, '', url);
  closeModalDOM();
}

function closeModalDOM() {
  removeFocusTrap();
  const bdrop = document.getElementById('bdrop');
  if (bdrop.hidden) return;
  bdrop.classList.remove('vis');
  setTimeout(() => {
    bdrop.hidden = true;
    unlockScroll();
    lastFocusedElement?.focus();
    lastFocusedElement = null;
  }, 260);
}

// ── Share ──────────────────────────────────────────────────
function showShareFallback(url) {
  document.getElementById('shareFallback')?.remove();
  const div = document.createElement('div');
  div.id = 'shareFallback';
  div.className = 'share-fallback';
  div.innerHTML = `
    <span>Copia el enlace:</span>
    <input type="url" value="${url}" readonly aria-label="Enlace para compartir">
    <button class="share-fallback-close" aria-label="Cerrar">✕</button>
  `;
  document.querySelector('.m-actions')?.after(div);
  const input = div.querySelector('input');
  input.focus();
  input.select();
  div.querySelector('.share-fallback-close').addEventListener('click', () => div.remove());
}

async function sharePokemon(id, name) {
  const url = `${location.origin}${location.pathname}?p=${id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `Pokédex — ${name}`, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // usuario canceló — no copiar
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Enlace copiado al portapapeles');
  } catch {
    showShareFallback(url);
  }
}

// ── Type chips / Filter bar ────────────────────────────────
function buildTypeGrid() {
  const grid = document.getElementById('typeGrid');
  if (!grid) return;

  function makePill(label, type, color) {
    const btn = document.createElement('button');
    btn.className = 'type-pill' + (type === 'all' ? ' is-active' : '');
    btn.dataset.type = type;
    btn.setAttribute('aria-pressed', type === 'all' ? 'true' : 'false');
    btn.style.setProperty('--pc', color);
    btn.textContent = label;

    btn.addEventListener('click', async () => {
      if (activeType === type) return;

      document.querySelectorAll('.type-pill').forEach(p => {
        p.classList.remove('is-active');
        p.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');

      activeType = type;

      if (type !== 'all' && !cache.has(`type:${type}`)) {
        showSkeletons(PAGE_SIZE);
        try {
          const td = await apiFetch(`${API}/type/${type}`);
          const ids = new Set(td.pokemon.map(p => idFromUrl(p.pokemon.url)));
          cache.set(`type:${type}`, ids);
        } catch {}
      }

      applyFilters();
    });

    grid.appendChild(btn);
  }

  makePill('Todos', 'all', '#6b7080');
  Object.entries(TYPE_ES).forEach(([key, label]) =>
    makePill(label, key, TYPE_COLORS[key] || '#888')
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

  activeType = 'all';
  searchQuery = '';
  showFavsOnly = false;
  document.getElementById('srch').value = '';

  document.querySelectorAll('.type-pill').forEach(p => {
    p.classList.remove('is-active');
    p.setAttribute('aria-pressed', 'false');
  });
  const allPill = document.querySelector('.type-pill[data-type="all"]');
  if (allPill) { allPill.classList.add('is-active'); allPill.setAttribute('aria-pressed', 'true'); }

  const btnExplore = document.getElementById('btnExplore');
  const btnFavs    = document.getElementById('btnFavs');
  if (btnExplore) { btnExplore.classList.add('is-active');  btnExplore.setAttribute('aria-pressed', 'true'); }
  if (btnFavs)    { btnFavs.classList.remove('is-active');  btnFavs.setAttribute('aria-pressed', 'false'); }

  loadGeneration(offset, limit);
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

document.getElementById('themeToggle').addEventListener('click', () => applyTheme(!isDark()));

// ── Nav tabs ───────────────────────────────────────────────
{
  const btnExplore = document.getElementById('btnExplore');
  const btnFavs    = document.getElementById('btnFavs');

  btnExplore?.addEventListener('click', () => {
    if (!showFavsOnly) return;
    showFavsOnly = false;
    btnExplore.classList.add('is-active');  btnExplore.setAttribute('aria-pressed', 'true');
    btnFavs.classList.remove('is-active'); btnFavs.setAttribute('aria-pressed', 'false');
    applyFilters();
  });

  btnFavs?.addEventListener('click', () => {
    if (showFavsOnly) return;
    showFavsOnly = true;
    btnFavs.classList.add('is-active');      btnFavs.setAttribute('aria-pressed', 'true');
    btnExplore.classList.remove('is-active'); btnExplore.setAttribute('aria-pressed', 'false');
    applyFilters();
  });
}

// ── Mobile sidebar ─────────────────────────────────────────
{
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const openBtn  = document.getElementById('mobileFilterBtn');
  const closeBtn = document.getElementById('sbClose');
  const clearBtn = document.getElementById('sbClear');

  function openSidebar() {
    sidebar?.classList.add('sb-open');
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar?.classList.remove('sb-open');
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  openBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);
  clearBtn?.addEventListener('click', () => { clearAllFilters(); closeSidebar(); });
}

// ── Sidebar clear (desktop) ────────────────────────────────
document.getElementById('sbClear')?.addEventListener('click', clearAllFilters);

// ── Init ───────────────────────────────────────────────────
loadFavorites();
initTheme();
buildTypeGrid();
updateFavsToggle();
loadGeneration(0, 151);

const _initialId = getPokemonIdFromUrl();
if (_initialId) openModal(_initialId, { skipHistory: true });

// ── Service Worker ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch(() => {});
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
      <div class="install-icon" aria-hidden="true">⚡</div>
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
  document.getElementById('installBanner')?.remove();
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
    t.setAttribute('role', 'status');
    t.innerHTML = '📡 Sin conexión — datos del caché';
    document.body.appendChild(t);
  } else {
    existing?.remove();
  }
}
window.addEventListener('offline', () => showOfflineToast(true));
window.addEventListener('online',  () => showOfflineToast(false));
