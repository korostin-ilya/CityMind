/**
 * CityMind — Логика приложения (app.js)
 * ---------------------------------------------------------------------------
 *  • Управление состоянием (state) + localStorage, экспорт / импорт JSON, сброс
 *  • Ролевой интерфейс: Горожанин / Оценщик / Админ-Лаборатория
 *  • Сжатие фото через <canvas> с водяным знаком
 *  • Карта MapLibre GL JS (растровые тайлы CARTO + офлайн-схема GeoJSON)
 *  • Графики Chart.js, KaTeX-предпросмотр формул, XAI-заключения
 *
 * Зависимости (глобальные): window.CityMindData (data.js), window.CityMind.Math (math.js),
 * maplibregl, Chart, math (Math.js), katex, lucide — все опциональные CDN проверяются.
 */
(function () {
  'use strict';

  // ==========================================================================
  // 0. ПРОВЕРКА ЗАВИСИМОСТЕЙ И КОНСТАНТЫ
  // ==========================================================================
  if (!window.CityMindData) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:16px;background:#fee2e2;color:#991b1b;font-family:sans-serif">Ошибка: файл data.js не загружен.</div>');
    return;
  }
  if (!window.CityMind || !window.CityMind.Math) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:16px;background:#fee2e2;color:#991b1b;font-family:sans-serif">Ошибка: файл math.js не загружен.</div>');
    return;
  }

  const D = window.CityMindData;
  const E = window.CityMind.Math;
  const FACTORS = E.FACTORS;
  const META = E.FACTOR_META;

  const STORAGE_KEY = 'citymind_ekibastuz_state_v1';
  const MAP_CENTER = [75.3260, 51.7290];
  const MAP_ZOOM = 12.6;
  const CITY_BBOX = { minLng: 75.24, maxLng: 75.42, minLat: 51.68, maxLat: 51.78 };
  const MAX_PHOTOS = 6;
  const PHOTO_MAX_WIDTH = 700;
  const PHOTO_QUALITY = 0.65;
  const FALLBACK_FORMULA = 'wS * S + wU * U + wP * P + wV * V + wF * F + wC * C_inv';

  const REJECT_REASONS = [
    'Дубль (такая заявка уже зарегистрирована)',
    'Фейк / недостоверные фотографии',
    'Не по адресу / вне зоны ответственности акимата',
    'Другое'
  ];

  const STRATEGY_LABEL = {
    sequential: 'Строго по порядку рейтинга',
    greedy_fill: 'Умное дозаполнение остатка (Greedy)'
  };

  const ROLE_BTN_BASE = 'flex-1 md:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ';
  const ROLE_BTN_ON = 'bg-indigo-600 text-white shadow';
  const ROLE_BTN_OFF = 'text-slate-600 hover:bg-white hover:text-slate-900';

  // ==========================================================================
  // 1. УТИЛИТЫ
  // ==========================================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function fmt(n, d) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    const dd = d == null ? 0 : d;
    return x.toLocaleString('ru-RU', { minimumFractionDigits: dd, maximumFractionDigits: dd });
  }
  function truncate(s, n) {
    const t = String(s || '');
    return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function ruDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function coordsText(c) {
    return `${Number(c[1]).toFixed(5)}, ${Number(c[0]).toFixed(5)}`;
  }
  function inCity(c) {
    return c[0] >= CITY_BBOX.minLng && c[0] <= CITY_BBOX.maxLng && c[1] >= CITY_BBOX.minLat && c[1] <= CITY_BBOX.maxLat;
  }
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }
  /** Короткая подпись проблемы (локация из описания) */
  function shortLabel(item, n) {
    const d = String(item.details || '').replace(/^\[Заявка #\d+\]:\s*/, '');
    const loc = d.split(/[.;(|]/)[0].trim() || item.title;
    return truncate(loc, n || 26);
  }
  function isCritical(p) {
    return Number(p.severity) >= 9 || Number(p.urgency) >= 9;
  }
  function valueText(f, v) {
    if (f === 'population') return fmt(v) + ' чел.';
    if (f === 'cost') return fmt(v, 1) + ' млн ₸';
    if (f === 'votes') return fmt(v) + ' гол.';
    return fmt(v) + '/10';
  }
  function rhoLabel(rho) {
    if (rho == null) return 'недостаточно данных';
    if (rho >= 0.9) return 'очень высокая согласованность';
    if (rho >= 0.7) return 'высокая согласованность';
    if (rho >= 0.5) return 'умеренная согласованность';
    if (rho >= 0.2) return 'слабая согласованность';
    return 'рейтинги расходятся';
  }
  function rhoColor(rho) {
    if (rho == null) return 'text-slate-400';
    if (rho >= 0.7) return 'text-emerald-600';
    if (rho >= 0.4) return 'text-amber-600';
    return 'text-rose-600';
  }

  // ==========================================================================
  // 2. СОСТОЯНИЕ И ХРАНЕНИЕ
  // ==========================================================================
  let state = null; // сохраняемое состояние

  /** Runtime-данные (не сохраняются) */
  const rt = {
    compiled: null,        // последняя валидная скомпилированная формула
    candidate: null,       // новая формула, ожидающая проверки на данных
    parseError: '',
    runtimeError: '',
    ranking: { rows: [], stats: E.computeStats([]) },
    rowById: {},
    topsis: { rows: [], byId: {}, ranks: {} },
    allocation: null,
    rhoTopsis: null,
    rhoBaseline: null,
    texFor: null,
    // карта
    map: null, mapReady: false, markers: new Map(), roadLabels: [],
    popup: null, popupId: null, pickMarker: null,
    // формы
    pickCoords: null, pendingPhotos: [],
    // модальные окна
    lightbox: { photos: [], index: 0, item: null },
    evalId: null, rejectId: null, explainId: null,
    // графики
    charts: {}, chartsInit: false,
    preview: null,
    flashId: null
  };

  function defaultState() {
    return Object.assign(deepClone(D.DEFAULT_APP_STATE), {
      formulaPresets: deepClone(D.FORMULA_PRESETS),
      problems: deepClone(D.PRESET_PROBLEMS),
      catalog: deepClone(D.DEFAULT_PROBLEM_CATALOG),
      baselineMeta: null,
      citizenSort: 'rank',
      schemaVersion: 1
    });
  }

  function normalizeProblem(p) {
    const src = p && typeof p === 'object' ? p : {};
    const coords = Array.isArray(src.coords) && src.coords.length === 2 &&
      Number.isFinite(+src.coords[0]) && Number.isFinite(+src.coords[1])
      ? [+src.coords[0], +src.coords[1]] : MAP_CENTER.slice();
    const out = Object.assign({
      id: 'prob_' + uid(),
      category: '', title: '', details: '',
      status: 'pending', rejectReason: '', createdAt: todayISO(),
      photos: [], mergedCount: 1, clusterRadius: 0,
      sourcePoints: [coords.slice()], sourceDetails: [src.details || ''],
      votes: 1, severity: 5, urgency: 5, population: 1000, cost: 10, feasibility: 5
    }, src, { coords });
    if (!['pending', 'evaluated', 'rejected'].includes(out.status)) out.status = 'pending';
    if (!Array.isArray(out.photos)) out.photos = [];
    out.votes = Math.max(1, Math.round(+out.votes || 1));
    out.severity = clamp(Math.round(+out.severity || 1), 1, 10);
    out.urgency = clamp(Math.round(+out.urgency || 1), 1, 10);
    out.feasibility = clamp(Math.round(+out.feasibility || 1), 1, 10);
    out.population = Math.max(0, Math.round(+out.population || 0));
    out.cost = Math.max(0.01, +(+out.cost || 0.01).toFixed(2));
    out.mergedCount = Math.max(1, +out.mergedCount || 1);
    out.id = String(out.id);
    return out;
  }

  function loadState() {
    const base = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.problems)) return base;
      return mergeIntoState(base, s);
    } catch (e) {
      console.warn('[CityMind] Не удалось прочитать localStorage:', e);
      return base;
    }
  }

  function mergeIntoState(base, s) {
    const merged = Object.assign(base, s);
    merged.weights = Object.assign({}, D.DEFAULT_APP_STATE.weights, s.weights || {});
    merged.catalog = s.catalog && typeof s.catalog === 'object' && Object.keys(s.catalog).length
      ? s.catalog : deepClone(D.DEFAULT_PROBLEM_CATALOG);
    merged.problems = (s.problems || []).map(normalizeProblem);
    merged.budgetLimit = clamp(+merged.budgetLimit || 300, 50, 1000);
    merged.clusterRadiusMeters = clamp(+merged.clusterRadiusMeters || 0, 0, 500);
    if (!['sequential', 'greedy_fill'].includes(merged.budgetStrategy)) merged.budgetStrategy = 'sequential';
    merged.formulaPresets = Array.isArray(s.formulaPresets) && s.formulaPresets.length
      ? s.formulaPresets.map((p, idx) => ({
          id: String(p.id || 'preset_' + (idx + 1)),
          name: String(p.name || ('Модель ' + (idx + 1))),
          shortName: String(p.shortName || ('Модель ' + (idx + 1))),
          description: String(p.description || ''),
          formula: String(p.formula || '')
        }))
      : deepClone(D.FORMULA_PRESETS);
    if (typeof merged.customFormula !== 'string') {
      merged.customFormula = merged.formulaPresets[0] ? merged.formulaPresets[0].formula : D.FORMULA_PRESETS[0].formula;
    }
    return merged;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('[CityMind] Ошибка сохранения:', e);
      toast('Не удалось сохранить данные: хранилище браузера переполнено. Экспортируйте JSON и удалите лишние фото.', 'error', 6000);
      return false;
    }
  }
  const saveSoon = debounce(saveState, 350);

  const getPresets = () => (Array.isArray(state.formulaPresets) && state.formulaPresets.length)
    ? state.formulaPresets
    : D.FORMULA_PRESETS;
  const getProblem = (id) => state.problems.find((p) => p.id === id);
  const evaluatedItems = () => state.problems.filter((p) => p.status === 'evaluated');
  const isFunded = (id) => !!(rt.allocation && rt.allocation.funded.has(id));

  function currentFormulaName() {
    const p = getPresets().find((x) => x.id === state.selectedPresetId);
    return p ? p.shortName : 'Пользовательская формула';
  }

  // ==========================================================================
  // 3. ФОРМУЛА И ПЕРЕСЧЁТ МОДЕЛИ
  // ==========================================================================
  const normWs = (s) => String(s || '').replace(/\s+/g, '');

  /** Принимает текст формулы: валидирует парсером, при успехе ставит кандидата на пересчёт */
  function applyFormulaText(text) {
    state.customFormula = text;
    const preset = getPresets().find((p) => normWs(p.formula) === normWs(text));
    state.selectedPresetId = preset ? preset.id : 'custom';
    const c = E.compileFormula(text, state.weights);
    if (c.ok) {
      rt.parseError = '';
      rt.candidate = c;
    } else {
      rt.parseError = c.error;
      rt.candidate = null;
    }
  }

  /** Полный пересчёт: рейтинг + XAI, TOPSIS, бюджет, Спирмен */
  function recompute() {
    const items = evaluatedItems();
    let ranking = null;
    let err = '';
    const tryRank = (c) => {
      try {
        return E.computeRanking(items, c.compiled, state.weights);
      } catch (e) {
        if (!err) err = e && e.message ? e.message : String(e);
        return null;
      }
    };

    if (rt.candidate) {
      ranking = tryRank(rt.candidate);
      if (ranking) rt.compiled = rt.candidate;
      rt.candidate = null;
    }
    if (!ranking && rt.compiled) ranking = tryRank(rt.compiled);
    if (!ranking) {
      const fb = E.compileFormula(FALLBACK_FORMULA, state.weights);
      if (fb.ok) {
        ranking = tryRank(fb);
        if (ranking) {
          if (!rt.compiled) rt.compiled = fb;
          if (err) err += ' Временно используется линейная модель WSM.';
        }
      }
    }
    if (!ranking) ranking = { rows: [], stats: E.computeStats(items) };

    rt.runtimeError = err;
    rt.ranking = ranking;
    rt.rowById = {};
    ranking.rows.forEach((r) => { rt.rowById[r.id] = r; });

    rt.topsis = E.topsis(items, state.weights);
    rt.allocation = E.allocateBudget(ranking.rows, state.budgetLimit, state.budgetStrategy);
    const cur = E.ranksMap(ranking.rows);
    rt.rhoTopsis = E.spearman(cur, rt.topsis.ranks);
    rt.rhoBaseline = state.baselineRanks ? E.spearman(cur, state.baselineRanks) : null;
  }

  let rafPending = false;
  /** Пересчёт и перерисовка не чаще одного раза за кадр (для ползунков) */
  function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      recompute();
      renderDynamic();
    });
  }

  function updateNow() {
    recompute();
    renderDynamic();
  }

  // ==========================================================================
  // 4. УВЕДОМЛЕНИЯ И МОДАЛЬНЫЕ ОКНА
  // ==========================================================================
  function toast(msg, type, timeout) {
    const host = $('#toastHost');
    if (!host) return;
    const styles = {
      info: 'bg-slate-900 text-white',
      success: 'bg-emerald-600 text-white',
      warn: 'bg-amber-500 text-slate-950',
      error: 'bg-rose-600 text-white'
    };
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '⛔' };
    const t = type || 'info';
    const el = document.createElement('div');
    el.className = `toast-enter pointer-events-auto rounded-xl shadow-lg px-3.5 py-2.5 text-sm flex gap-2 items-start ${styles[t] || styles.info}`;
    el.innerHTML = `<span>${icons[t] || ''}</span><div class="flex-1 leading-snug">${msg}</div><button class="opacity-70 hover:opacity-100 leading-none" aria-label="Закрыть">✕</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, timeout || 4200);
  }

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('hidden');
    if (!$$('[data-modal]').some((x) => !x.classList.contains('hidden'))) {
      document.body.classList.remove('modal-open');
    }
    if (id === 'modalExplain') rt.explainId = null;
  }
  function closeTopModal() {
    const order = ['modalLightbox', 'modalPreset', 'modalReject', 'modalEval', 'modalExplain'];
    for (const id of order) {
      const m = document.getElementById(id);
      if (m && !m.classList.contains('hidden')) { closeModal(id); return true; }
    }
    return false;
  }

  // ==========================================================================
  // 5. HTML-ФРАГМЕНТЫ (бейджи, полоса XAI, миниатюры)
  // ==========================================================================
  function statusBadge(p) {
    const base = 'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ';
    if (p.status === 'pending') return `<span class="${base}bg-violet-50 text-violet-700 border-violet-200 border-dashed">⏳ Ожидает оценщика</span>`;
    if (p.status === 'rejected') return `<span class="${base}bg-rose-50 text-rose-700 border-rose-200">✕ Отклонена</span>`;
    return isFunded(p.id)
      ? `<span class="${base}bg-emerald-50 text-emerald-700 border-emerald-200">● Первостепенная (В бюджете)</span>`
      : `<span class="${base}bg-amber-50 text-amber-700 border-amber-200">○ Второстепенная (Дефицит бюджета)</span>`;
  }
  function criticalBadge(p) {
    return isCritical(p)
      ? '<span class="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-rose-600 text-white">⚠ Авария</span>'
      : '';
  }
  function trustBadge(p) {
    const n = (p.photos || []).length;
    return `<span class="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${n ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}">📷 Подтверждено фото: ${n} шт. | Слито заявок: ${p.mergedCount || 1}</span>`;
  }
  function categoryChip(p) {
    return `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${esc(p.category || 'Без категории')}</span>`;
  }
  function xaiBar(row, heightClass) {
    if (!row) return '';
    const h = heightClass || 'h-2.5';
    if (!(row.deltaSum > 0)) {
      return `<div class="${h} rounded-full bg-slate-100" title="Формула не зависит от факторов"></div>`;
    }
    const segs = FACTORS.map((f) => {
      const v = row.contributions[f];
      if (v < 0.05) return '';
      return `<div style="width:${v.toFixed(2)}%;background:${META[f].color}" title="${esc(META[f].label)}: ${fmt(v, 1)}%"></div>`;
    }).join('');
    return `<div class="flex ${h} rounded-full overflow-hidden bg-slate-100">${segs}</div>`;
  }
  function topFactor(row) {
    if (!row || !(row.deltaSum > 0)) return null;
    return FACTORS.slice().sort((a, b) => row.contributions[b] - row.contributions[a])[0];
  }
  function photoThumbs(p, max, size) {
    const photos = p.photos || [];
    const sz = size || 'w-16 h-12';
    if (!photos.length) {
      return `<div class="${sz} rounded-md bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">нет фото</div>`;
    }
    const lim = max || photos.length;
    let html = photos.slice(0, lim).map((src, i) =>
      `<button type="button" data-action="photo" data-id="${esc(p.id)}" data-index="${i}" class="${sz} shrink-0 rounded-md overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-400 bg-slate-900" title="Открыть фото ${i + 1}">
        <img src="${esc(src)}" alt="Фото ${i + 1}" loading="lazy" class="w-full h-full object-cover" />
      </button>`).join('');
    if (photos.length > lim) {
      html += `<button type="button" data-action="photo" data-id="${esc(p.id)}" data-index="${lim}" class="${sz} shrink-0 rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">+${photos.length - lim}</button>`;
    }
    return html;
  }
  function detailsList(p) {
    if ((p.mergedCount || 1) > 1 && Array.isArray(p.sourceDetails) && p.sourceDetails.length > 1) {
      return `<ol class="list-decimal list-inside space-y-0.5">${p.sourceDetails.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>`;
    }
    return esc(p.details);
  }

  // ==========================================================================
  // 6. ОБЩИЙ РЕНДЕР
  // ==========================================================================
  function renderDynamic() {
    renderKPI();
    renderMapData();
    renderActiveRole();
    refreshPopup();
    if (rt.explainId && !$('#modalExplain').classList.contains('hidden')) {
      $('#explainBody').innerHTML = explainHtml(rt.explainId);
    }
  }

  function renderActiveRole() {
    if (state.activeRole === 'citizen') {
      renderCitizenList();
      renderNearbyHint();
    } else if (state.activeRole === 'evaluator') {
      renderEvaluator();
      renderClusterPreview();
    } else {
      renderAdminDynamic();
    }
  }

  function renderAll() {
    renderFilterOptions();
    renderCitizenFormSelects();
    renderCitizenCoords();
    renderPhotoPreviews();
    renderCatalog();
    renderDynamic();
  }

  // ---------- KPI ----------
  function renderKPI() {
    const evalN = rt.ranking.rows.length;
    const pendN = state.problems.filter((p) => p.status === 'pending').length;
    const al = rt.allocation;
    $('#kpiEvaluated').textContent = evalN;
    $('#kpiPending').textContent = pendN;
    $('#kpiPendingSub').textContent = plural(pendN, 'новая заявка', 'новые заявки', 'новых заявок');
    $('#kpiBudget').textContent = `${fmt(al.spent, 1)} / ${fmt(al.budget)}`;
    $('#kpiBudgetBar').style.width = `${clamp(al.utilization * 100, 0, 100).toFixed(1)}%`;
    $('#kpiBudgetSub').textContent = `млн ₸ • освоено ${fmt(al.utilization * 100, 1)}%`;
    $('#kpiFunded').textContent = `${al.funded.size} из ${evalN}`;
    $('#kpiFundedSub').textContent = `дефицит ${fmt(al.deficit, 1)} млн ₸`;
    const rho = rt.rhoTopsis;
    const kr = $('#kpiRho');
    kr.textContent = rho == null ? '—' : (rho >= 0 ? '+' : '') + rho.toFixed(2);
    kr.className = `text-2xl font-bold tabular ${rhoColor(rho)}`;
    $('#kpiRhoLabel').textContent = rhoLabel(rho);
    $('#kpiFormula').textContent = currentFormulaName();
    $('#kpiStrategy').textContent = STRATEGY_LABEL[state.budgetStrategy];
  }

  // ---------- Фильтры карты ----------
  function renderFilterOptions() {
    const sel = $('#mapFilterCategory');
    const cats = Object.keys(state.catalog);
    state.problems.forEach((p) => { if (p.category && !cats.includes(p.category)) cats.push(p.category); });
    if (state.categoryFilter !== 'all' && !cats.includes(state.categoryFilter)) state.categoryFilter = 'all';
    sel.innerHTML = '<option value="all">Все категории</option>' +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = state.categoryFilter;
    $('#mapFilterStatus').value = state.statusFilter || 'all';
  }

  function passesFilters(p) {
    if (p.status !== 'pending' && p.status !== 'evaluated') return false;
    if (state.categoryFilter !== 'all' && p.category !== state.categoryFilter) return false;
    switch (state.statusFilter) {
      case 'pending': return p.status === 'pending';
      case 'evaluated': return p.status === 'evaluated';
      case 'funded': return p.status === 'evaluated' && isFunded(p.id);
      case 'deficit': return p.status === 'evaluated' && !isFunded(p.id);
      default: return true;
    }
  }

  // ==========================================================================
  // 7. РОЛЬ 1 — ГОРОЖАНИН
  // ==========================================================================
  function renderCitizenFormSelects() {
    const catSel = $('#fCategory');
    const prev = catSel.value;
    const cats = Object.keys(state.catalog);
    catSel.innerHTML = cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (cats.includes(prev)) catSel.value = prev;
    renderTitleSelect();
  }

  function renderTitleSelect() {
    const cat = $('#fCategory').value;
    const titles = state.catalog[cat] || [];
    const tSel = $('#fTitle');
    const prev = tSel.value;
    tSel.innerHTML = titles.length
      ? titles.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')
      : '<option value="">— в категории нет типовых проблем —</option>';
    if (titles.includes(prev)) tSel.value = prev;
  }

  function renderCitizenCoords() {
    const el = $('#fCoords');
    if (rt.pickCoords) {
      el.className = 'text-sm rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-indigo-800 font-medium tabular';
      el.textContent = `📍 lat ${rt.pickCoords[1].toFixed(5)}, lng ${rt.pickCoords[0].toFixed(5)}`;
    } else {
      el.className = 'text-sm rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2 text-slate-500';
      el.textContent = 'Кликните по карте Экибастуза, чтобы выбрать точку';
    }
  }

  function renderPhotoPreviews() {
    const host = $('#fPhotoPreviews');
    host.innerHTML = rt.pendingPhotos.map((ph, i) => `
      <div class="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
        <img src="${esc(ph.url)}" alt="Превью ${i + 1}" class="w-full h-full object-cover" />
        <button type="button" data-action="remove-photo" data-index="${i}" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-slate-900/70 text-white text-xs leading-none" aria-label="Удалить фото">✕</button>
      </div>`).join('');
  }

  function findNearbySameTitle(title, coords, excludeId) {
    const R = state.clusterRadiusMeters;
    if (!title || !coords || !(R > 0)) return [];
    return state.problems
      .filter((p) => p.id !== excludeId && p.title === title && (p.status === 'pending' || p.status === 'evaluated'))
      .map((p) => ({ p, d: E.haversine(coords, p.coords) }))
      .filter((x) => x.d <= R)
      .sort((a, b) => a.d - b.d);
  }

  function renderNearbyHint() {
    const el = $('#fNearbyHint');
    const near = findNearbySameTitle($('#fTitle').value, rt.pickCoords, null);
    if (!near.length) { el.classList.add('hidden'); return; }
    const n = near[0];
    el.classList.remove('hidden');
    el.innerHTML = `🔗 В радиусе R = ${state.clusterRadiusMeters} м уже есть ${near.length} ${plural(near.length, 'заявка', 'заявки', 'заявок')} с таким же названием
      (ближайшая — <b>${Math.round(n.d)} м</b>, ${n.p.votes} гол.). Ваша заявка может быть объединена с ней в общий кластер —
      либо просто <button type="button" data-action="vote" data-id="${esc(n.p.id)}" class="underline font-semibold">поддержите существующую (+1 голос)</button>.`;
  }

  function citizenSorted(list) {
    const mode = state.citizenSort || 'rank';
    const arr = list.slice();
    if (mode === 'votes') return arr.sort((a, b) => b.votes - a.votes);
    if (mode === 'new') return arr.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.votes - a.votes);
    return arr.sort((a, b) => {
      const ra = rt.rowById[a.id], rb = rt.rowById[b.id];
      if (ra && rb) return ra.rank - rb.rank;
      if (ra) return -1;
      if (rb) return 1;
      return b.votes - a.votes;
    });
  }

  function renderCitizenList() {
    const list = citizenSorted(state.problems.filter(passesFilters));
    $('#citizenListCount').textContent = `(${list.length})`;
    const host = $('#citizenList');
    if (!list.length) {
      host.innerHTML = '<div class="text-sm text-slate-500 py-8 text-center md:col-span-2 2xl:col-span-3">Нет проблем, удовлетворяющих фильтрам.</div>';
      return;
    }
    host.innerHTML = list.map((p) => {
      const r = rt.rowById[p.id];
      const rankChip = r
        ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">#${r.rank} • ${fmt(r.score, 1)} балл.</span>`
        : '';
      return `
      <article class="border border-slate-200 rounded-xl p-3 flex gap-3 hover:border-indigo-200 hover:shadow-sm transition">
        <div class="flex flex-col gap-1">${photoThumbs(p, 1, 'w-20 h-16 sm:w-24 sm:h-20')}</div>
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap gap-1 items-center">${rankChip}${statusBadge(p)}${criticalBadge(p)}</div>
          <h3 class="font-semibold text-sm text-slate-900 mt-1 leading-snug">${esc(p.title)}</h3>
          <div class="mt-0.5">${categoryChip(p)}${(p.mergedCount || 1) > 1 ? ` <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white">×${p.mergedCount}</span>` : ''}</div>
          <p class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(p.details)}</p>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span class="text-sm font-bold text-violet-700 tabular">👍 ${fmt(p.votes)}</span>
            <button type="button" data-action="vote" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5">Поддержать проблему (+1 голос)</button>
            <button type="button" data-action="focus" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 px-2.5 py-1.5">На карте</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  // ==========================================================================
  // 8. РОЛЬ 2 — ОЦЕНЩИК
  // ==========================================================================
  function renderClusterPreview() {
    const R = state.clusterRadiusMeters;
    const res = E.clusterProblems(state.problems, R);
    rt.preview = res;
    const host = $('#clusterPreview');
    if (!(R > 0)) {
      host.innerHTML = '<b>R = 0 м</b> — объединение отключено. Увеличьте радиус, чтобы увидеть кандидатов на слияние.';
    } else if (!res.groups.length) {
      host.innerHTML = `В радиусе <b>R = ${R} м</b> однотипных заявок для объединения не найдено.`;
    } else {
      host.innerHTML = `
        <div>Предпросмотр при <b>R = ${R} м</b>: <b class="text-indigo-700">${res.involved} ${plural(res.involved, 'заявка', 'заявки', 'заявок')}</b>
        → <b class="text-indigo-700">${res.groups.length} ${plural(res.groups.length, 'кластер', 'кластера', 'кластеров')}</b></div>
        <ul class="mt-2 space-y-1 text-xs">
          ${res.groups.map((g) => `<li class="flex gap-2"><span class="shrink-0 px-1.5 rounded-full text-[10px] font-bold ${g.status === 'pending' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}">${g.status === 'pending' ? 'pending' : 'evaluated'}</span>
          <span>${esc(truncate(g.title, 60))} — <b>${g.count} шт.</b>, радиус ${g.radius} м</span></li>`).join('')}
        </ul>`;
    }
    renderPreviewLayer();
  }

  function renderEvaluator() {
    // --- Очередь pending ---
    const pending = state.problems.filter((p) => p.status === 'pending' && passesCategory(p))
      .sort((a, b) => b.votes - a.votes);
    $('#queueCount').textContent = pending.length;
    $('#queueList').innerHTML = pending.length ? pending.map((p) => `
      <article class="border border-violet-200 border-dashed rounded-xl p-3 bg-violet-50/30">
        <div class="flex flex-wrap items-center gap-1.5">${statusBadge(p)}${criticalBadge(p)}${trustBadge(p)}</div>
        <h3 class="font-semibold text-sm text-slate-900 mt-1.5">${esc(p.title)}</h3>
        <div class="mt-0.5 flex flex-wrap gap-1 items-center">${categoryChip(p)}<span class="text-[11px] text-slate-500">• ${ruDate(p.createdAt)} • 📍 ${coordsText(p.coords)} • 👍 ${fmt(p.votes)}</span></div>
        <div class="text-xs text-slate-600 mt-2">${detailsList(p)}</div>
        <div class="flex gap-2 mt-2 overflow-x-auto scrollbar-thin pb-1">${photoThumbs(p, 6, 'w-20 h-14')}</div>
        <div class="flex flex-wrap gap-2 mt-2">
          <button type="button" data-action="evaluate" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5">🛠 Провести экспертизу</button>
          <button type="button" data-action="reject" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 px-3 py-1.5">Отклонить заявку</button>
          <button type="button" data-action="focus" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5">На карте</button>
        </div>
      </article>`).join('')
      : '<div class="text-sm text-slate-500 py-8 text-center">🎉 Очередь пуста — все заявки обработаны.</div>';

    // --- Реестр evaluated ---
    const rows = rt.ranking.rows.filter((r) => passesCategory(r.item));
    $('#registryCount').textContent = rows.length;
    $('#registryList').innerHTML = rows.length ? rows.map((r) => {
      const p = r.item;
      return `
      <div class="px-4 py-3 hover:bg-slate-50">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 shrink-0 rounded-lg ${isFunded(p.id) ? 'bg-emerald-600' : 'bg-amber-500'} text-white text-sm font-bold flex items-center justify-center">${r.rank}</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-slate-900 leading-snug">${esc(truncate(p.title, 70))}</div>
            <div class="text-[11px] text-slate-500">${esc(shortLabel(p, 50))}</div>
            <div class="flex flex-wrap gap-x-2 text-[11px] text-slate-600 mt-1 tabular">
              <span>S ${p.severity}</span><span>U ${p.urgency}</span><span>P ${fmt(p.population)}</span><span>C ${fmt(p.cost, 1)}</span><span>F ${p.feasibility}</span><span>V ${fmt(p.votes)}</span>
            </div>
            <div class="flex flex-wrap gap-1 mt-1">${trustBadge(p)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-bold text-indigo-700 tabular">${fmt(r.score, 1)}</div>
            <div class="flex flex-col gap-1 mt-1">
              <button type="button" data-action="evaluate" data-id="${esc(p.id)}" class="text-[11px] font-semibold text-indigo-600 hover:underline">Редактировать</button>
              <button type="button" data-action="explain" data-id="${esc(p.id)}" class="text-[11px] font-semibold text-slate-600 hover:underline">XAI</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="text-sm text-slate-500 py-6 text-center">Нет оценённых задач.</div>';

    // --- Отклонённые ---
    const rejected = state.problems.filter((p) => p.status === 'rejected');
    $('#rejectedCount').textContent = rejected.length;
    $('#rejectedList').innerHTML = rejected.length ? rejected.map((p) => `
      <div class="px-4 py-2.5 flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-slate-800">${esc(truncate(p.title, 70))}</div>
          <div class="text-[11px] text-slate-500">${esc(shortLabel(p, 60))}</div>
          <div class="text-[11px] text-rose-700 mt-0.5">Причина: ${esc(p.rejectReason || 'не указана')}</div>
        </div>
        <button type="button" data-action="restore" data-id="${esc(p.id)}" class="text-[11px] font-semibold text-indigo-600 hover:underline shrink-0">Вернуть в очередь</button>
      </div>`).join('') : '<div class="text-sm text-slate-500 py-4 text-center">Отклонённых заявок нет.</div>';
  }

  function passesCategory(p) {
    return state.categoryFilter === 'all' || p.category === state.categoryFilter;
  }

  // ==========================================================================
  // 9. РОЛЬ 3 — АДМИН / ЛАБОРАТОРИЯ
  // ==========================================================================
  function buildPresetButtons() {
    const presets = getPresets();
    $('#presetButtons').innerHTML = presets.map((p, i) => {
      const isSelected = p.id === state.selectedPresetId;
      const isFirst = i === 0;
      const isLast = i === presets.length - 1;
      return `
        <div data-preset-card="${esc(p.id)}" class="inline-flex items-center rounded-lg border shadow-xs transition-all text-xs font-semibold overflow-hidden group ${
          isSelected
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
        }">
          <button type="button" data-action="preset" data-preset="${esc(p.id)}" title="${esc(p.description || p.name)}"
            class="preset-main-btn px-3 py-1.5 flex items-center gap-1.5 focus:outline-none select-none text-left">
            <span>${esc(p.shortName)}</span>
          </button>
          <div class="preset-controls flex items-center border-l text-xs ${
            isSelected
              ? 'border-indigo-500/80 bg-indigo-700/60 text-white'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }">
            <button type="button" data-action="preset-move" data-preset="${esc(p.id)}" data-dir="-1" title="Переместить влево (выше)"
              class="px-1.5 py-1.5 hover:bg-black/10 transition-colors focus:outline-none ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}">◀</button>
            <button type="button" data-action="preset-move" data-preset="${esc(p.id)}" data-dir="1" title="Переместить вправо (ниже)"
              class="px-1.5 py-1.5 hover:bg-black/10 transition-colors focus:outline-none ${isLast ? 'opacity-30 cursor-not-allowed' : ''}">▶</button>
            <button type="button" data-action="preset-delete" data-preset="${esc(p.id)}" title="Удалить модель"
              class="px-1.5 py-1.5 hover:bg-rose-500 hover:text-white transition-colors focus:outline-none">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderPresetState() {
    const presets = getPresets();
    $$('[data-preset-card]').forEach((card) => {
      const pid = card.dataset.presetCard;
      const isSelected = pid === state.selectedPresetId;
      card.className = 'inline-flex items-center rounded-lg border shadow-xs transition-all text-xs font-semibold overflow-hidden group ' +
        (isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300');
      const ctrls = card.querySelector('.preset-controls');
      if (ctrls) {
        ctrls.className = 'preset-controls flex items-center border-l text-xs ' +
          (isSelected ? 'border-indigo-500/80 bg-indigo-700/60 text-white' : 'border-slate-200 bg-slate-50 text-slate-500');
      }
    });
    const p = presets.find((x) => x.id === state.selectedPresetId);
    $('#presetDesc').innerHTML = p
      ? `<b class="text-slate-700">${esc(p.name)}.</b> ${esc(p.description)}`
      : '<b class="text-slate-700">Пользовательская формула.</b> Модель собрана вручную в калькуляторе.';
  }

  function buildVariableButtons() {
    const V = D.FORMULA_VARIABLES;
    const btn = (token, label, tip, cls) =>
      `<button type="button" data-action="token" data-token="${esc(token)}" title="${esc(tip)}"
        class="text-[11px] sm:text-xs font-mono rounded-md border px-2 py-1 transition-colors ${cls}">${esc(label)}</button>`;
    const group = (title, items) => `
      <div>
        <div class="text-[11px] font-semibold text-slate-500 mb-1">${title}</div>
        <div class="flex flex-wrap gap-1.5">${items}</div>
      </div>`;
    $('#varGroups').innerHTML = [
      group('Группа 1 — текущие и суммарные значения (X_current / X_total)',
        V.currentAndTotal.map((v) => btn(v.token, v.token, `${v.label}: ${v.desc}. Алиас: ${v.alias}`,
          'bg-slate-50 border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300')).join('') +
        btn('problems_count', 'problems_count', 'Общее число оцениваемых проблем. Алиас: N',
          'bg-slate-50 border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300')),
      group('Группа 2 — относительные доли в городе [0..1]',
        V.relativeShares.map((v) => btn(v.token, v.label, `${v.desc}. Короткая запись: ${v.shortToken}`,
          'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100')).join('')),
      group('Группа 3 — мин-макс нормализация [0.01..1.00]',
        V.normalized.map((v) => btn(v.token, v.label, v.desc,
          'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100')).join('')),
      group('Группа 4 — весовые коэффициенты (ползунки справа)',
        V.weights.map((v) => btn(v.token, v.label, `${v.label}, по умолчанию ${v.defaultVal}`,
          'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100')).join('')),
      group('Операторы и функции',
        V.operators.map((v) => btn(v.token, v.label, `Вставить: ${v.token.trim()}`,
          'bg-white border-slate-300 text-slate-800 hover:bg-slate-100')).join(''))
    ].join('');
  }

  function buildWeightSliders() {
    $('#weightSliders').innerHTML = D.FORMULA_VARIABLES.weights.map((w) => {
      const f = FACTORS.find((x) => META[x].weight === w.token);
      const color = f ? META[f].color : '#4f46e5';
      return `
      <div>
        <div class="flex items-center justify-between text-xs">
          <label for="w_${w.token}" class="font-semibold text-slate-700 flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${color}"></span>${esc(w.label)}
          </label>
          <span id="wv_${w.token}" class="font-mono font-bold text-slate-900 tabular">0.00</span>
        </div>
        <input id="w_${w.token}" data-weight="${w.token}" type="range" min="0" max="5" step="0.01" class="w-full" style="accent-color:${color}" />
      </div>`;
    }).join('');
  }

  function syncWeightSliders() {
    let sum = 0;
    D.FORMULA_VARIABLES.weights.forEach((w) => {
      const v = Number(state.weights[w.token]) || 0;
      sum += v;
      const inp = document.getElementById('w_' + w.token);
      if (inp && document.activeElement !== inp) inp.value = v;
      const lab = document.getElementById('wv_' + w.token);
      if (lab) lab.textContent = v.toFixed(2);
    });
    const ws = $('#weightSum');
    ws.textContent = `Σ = ${sum.toFixed(2)}`;
    ws.className = `text-xs tabular font-semibold ${Math.abs(sum - 1) < 0.005 ? 'text-emerald-600' : 'text-amber-600'}`;
  }

  function renderFormulaState() {
    const ta = $('#formulaInput');
    const err = rt.parseError || rt.runtimeError;
    ta.classList.toggle('formula-invalid', !!err);
    ta.classList.toggle('formula-valid', !err);
    const box = $('#formulaError');
    if (err) {
      box.classList.remove('hidden');
      box.innerHTML = `⚠ ${esc(err)}<div class="text-rose-600/80 mt-0.5">Таблица и графики сохраняют предыдущий валидный расчёт до исправления формулы.</div>`;
    } else {
      box.classList.add('hidden');
      box.textContent = '';
    }
    $('#formulaStatus').innerHTML = err
      ? '<span class="text-rose-600 font-semibold">● Ошибка в формуле</span>'
      : `<span class="text-emerald-600 font-semibold">● Формула корректна</span> <span class="text-slate-500">— рейтинг пересчитан для ${rt.ranking.rows.length} проблем</span>`;

    // LaTeX-предпросмотр последней валидной формулы
    const note = $('#formulaTexNote');
    note.textContent = err && rt.compiled ? 'показана последняя корректная версия' : '';
    if (rt.compiled && rt.texFor !== rt.compiled.text) {
      rt.texFor = rt.compiled.text;
      const host = $('#formulaTex');
      const tex = E.toLatex(rt.compiled.node);
      if (tex && window.katex) {
        try {
          window.katex.render(tex, host, { throwOnError: true, displayMode: true });
        } catch (e) {
          console.warn('[CityMind] KaTeX warning:', e);
          host.innerHTML = `<code class="text-xs text-slate-800 font-mono">${esc(rt.compiled.text)}</code>`;
        }
      } else {
        host.innerHTML = `<code class="text-xs text-slate-800 font-mono">${esc(rt.compiled.text)}</code>`;
      }
    }
  }

  function renderBudgetPanel() {
    const al = rt.allocation;
    $('#budgetValue').textContent = fmt(state.budgetLimit);
    $('#budgetSummary').innerHTML = `
      <div class="flex justify-between"><span>Освоено</span><b class="text-slate-900 tabular">${fmt(al.spent, 1)} млн ₸ (${fmt(al.utilization * 100, 1)}%)</b></div>
      <div class="flex justify-between"><span>Остаток бюджета</span><b class="text-slate-900 tabular">${fmt(al.remaining, 1)} млн ₸</b></div>
      <div class="flex justify-between"><span>Профинансировано задач</span><b class="text-emerald-700 tabular">${al.funded.size} из ${rt.ranking.rows.length}</b></div>
      <div class="flex justify-between"><span>Дефицит (не профинансировано)</span><b class="text-amber-700 tabular">${fmt(al.deficit, 1)} млн ₸</b></div>`;

    const rt1 = rt.rhoTopsis;
    const e1 = $('#rhoTopsis');
    e1.textContent = rt1 == null ? '—' : (rt1 >= 0 ? '+' : '') + rt1.toFixed(2);
    e1.className = `text-xl font-bold tabular ${rhoColor(rt1)}`;
    $('#rhoTopsisLabel').textContent = rhoLabel(rt1);

    const rb = rt.rhoBaseline;
    const e2 = $('#rhoBaseline');
    if (state.baselineRanks) {
      e2.textContent = rb == null ? '—' : (rb >= 0 ? '+' : '') + rb.toFixed(2);
      e2.className = `text-xl font-bold tabular ${rhoColor(rb)}`;
      $('#rhoBaselineLabel').textContent = rb == null ? 'мало общих задач' : (rb >= 0.999 ? 'рейтинг не изменился' : rhoLabel(rb));
      const m = state.baselineMeta || {};
      $('#baselineInfo').textContent = `Слот А: «${m.formulaName || '—'}», ${m.count || 0} задач, ${m.time || ''}`;
      $('#btnClearBaseline').classList.remove('hidden');
    } else {
      e2.textContent = '—';
      e2.className = 'text-xl font-bold tabular text-slate-400';
      $('#rhoBaselineLabel').textContent = 'слот не зафиксирован';
      $('#baselineInfo').textContent = 'Зафиксируйте рейтинг, затем меняйте формулу и веса — увидите ▲▼ смещения.';
      $('#btnClearBaseline').classList.add('hidden');
    }
    $$('input[name="budgetStrategy"]').forEach((r) => { r.checked = r.value === state.budgetStrategy; });
  }

  function renderFactorLegend() {
    $('#factorLegend').innerHTML = '<span class="font-semibold text-slate-500">Цвета вклада:</span>' +
      FACTORS.map((f) => `<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm inline-block" style="background:${META[f].color}"></span>${META[f].label}</span>`).join('');
  }

  function deltaCell(id, rank) {
    if (!state.baselineRanks) return '<span class="text-slate-300">—</span>';
    const base = state.baselineRanks[id];
    if (base == null) return '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">нов.</span>';
    const d = base - rank;
    if (d > 0) return `<span class="text-xs font-bold text-emerald-600 tabular">▲ +${d}</span>`;
    if (d < 0) return `<span class="text-xs font-bold text-rose-600 tabular">▼ ${d}</span>`;
    return '<span class="text-xs text-slate-400">＝ 0</span>';
  }

  function cellInput(p, field, min, max, step) {
    return `<input type="number" class="cell-input" data-edit="${field}" data-id="${esc(p.id)}" value="${p[field]}" min="${min}" ${max != null ? `max="${max}"` : ''} step="${step}" aria-label="${esc(META[field].label)}" />`;
  }

  function renderRankingTable() {
    const rows = rt.ranking.rows;
    $('#rankingMeta').textContent = `• ${rows.length} ${plural(rows.length, 'проблема', 'проблемы', 'проблем')} • модель: ${currentFormulaName()} • ${STRATEGY_LABEL[state.budgetStrategy]}`;
    const body = $('#rankingBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="14" class="px-4 py-10 text-center text-slate-500">Нет оценённых проблем. Утвердите заявки в кабинете оценщика или добавьте тестовую проблему.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => {
      const p = r.item;
      const t = rt.topsis.byId[p.id];
      const tf = topFactor(r);
      const funded = isFunded(p.id);
      const tDiff = t ? t.rank - r.rank : 0;
      return `
      <tr data-row-id="${esc(p.id)}" class="cursor-pointer hover:bg-indigo-50/40 ${p.id === state.selectedProblemId ? 'bg-indigo-50/60' : ''} ${p.id === rt.flashId ? 'row-flash' : ''}">
        <td class="px-3 py-2 align-top"><span class="inline-flex w-7 h-7 rounded-lg items-center justify-center text-xs font-bold text-white ${funded ? 'bg-emerald-600' : 'bg-amber-500'}">${r.rank}</span></td>
        <td class="px-2 py-2 align-top pt-3">${deltaCell(p.id, r.rank)}</td>
        <td class="px-2 py-2 align-top">
          <button type="button" data-action="explain" data-id="${esc(p.id)}" class="text-left font-semibold text-slate-900 hover:text-indigo-700 leading-snug text-[13px]">${esc(truncate(p.title, 64))}</button>
          <div class="text-[11px] text-slate-500 leading-snug">${esc(p.category)} • ${esc(shortLabel(p, 44))}</div>
          <div class="flex flex-wrap gap-1 mt-0.5">${criticalBadge(p)}${(p.mergedCount || 1) > 1 ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white">×${p.mergedCount}</span>` : ''}</div>
        </td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'severity', 1, 10, 1)}</td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'urgency', 1, 10, 1)}</td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'population', 0, null, 100)}</td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'cost', 0.1, null, 0.5)}</td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'feasibility', 1, 10, 1)}</td>
        <td class="px-1 py-2 align-top">${cellInput(p, 'votes', 1, null, 1)}</td>
        <td class="px-2 py-2 align-top text-right">
          <div class="font-bold text-indigo-700 tabular">${fmt(r.score, 1)}</div>
          <div class="text-[10px] text-slate-400 tabular" title="Сырой балл Y_i">Y=${fmt(r.raw, 3)}</div>
        </td>
        <td class="px-2 py-2 align-top text-center">
          <div class="text-sm font-semibold text-slate-700 tabular">#${t ? t.rank : '—'}</div>
          <div class="text-[10px] tabular ${tDiff === 0 ? 'text-slate-400' : (tDiff > 0 ? 'text-emerald-600' : 'text-rose-600')}">${t ? 'C*=' + t.closeness.toFixed(2) : ''}</div>
        </td>
        <td class="px-2 py-2 align-top">
          ${xaiBar(r, 'h-3')}
          <div class="text-[10px] text-slate-500 mt-1">${tf ? `Главный фактор: <b style="color:${META[tf].color}">${META[tf].label}</b> ${fmt(r.contributions[tf], 0)}%` : 'Вклады не определены'}</div>
        </td>
        <td class="px-2 py-2 align-top">${statusBadge(p)}</td>
        <td class="px-2 py-2 align-top text-right whitespace-nowrap">
          <button type="button" data-action="explain" data-id="${esc(p.id)}" class="p-1 rounded hover:bg-indigo-100" title="XAI-объяснение">🔍</button>
          <button type="button" data-action="delete" data-id="${esc(p.id)}" class="p-1 rounded hover:bg-rose-100" title="Удалить проблему">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  function renderAdminDynamic() {
    renderPresetState();
    syncWeightSliders();
    renderFormulaState();
    renderBudgetPanel();
    renderRankingTable();
    ensureCharts();
    updateCharts();
  }

  // ---------- Справочник ----------
  function renderCatalog() {
    const cats = Object.keys(state.catalog);
    const usage = (cat, title) => state.problems.filter((p) => p.category === cat && (title == null || p.title === title)).length;
    $('#catalogList').innerHTML = cats.length ? cats.map((cat, ci) => {
      const titles = state.catalog[cat] || [];
      const used = usage(cat);
      return `
      <div class="border border-slate-200 rounded-xl p-3 flex flex-col">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-900 text-sm">${esc(cat)}</div>
            <div class="text-[11px] text-slate-500">${titles.length} ${plural(titles.length, 'тип', 'типа', 'типов')} • ${used} ${plural(used, 'заявка', 'заявки', 'заявок')}</div>
          </div>
          <button type="button" data-action="cat-del" data-ci="${ci}" class="text-xs text-rose-600 hover:bg-rose-50 rounded px-1.5 py-0.5" title="Удалить категорию">🗑</button>
        </div>
        <ul class="mt-2 space-y-1 flex-1">
          ${titles.map((t, ti) => {
            const u = usage(cat, t);
            return `<li class="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 rounded-md px-2 py-1.5">
              <span class="flex-1">${esc(t)}${u ? ` <span class="text-slate-400">(${u})</span>` : ''}</span>
              <button type="button" data-action="title-del" data-ci="${ci}" data-ti="${ti}" class="text-slate-400 hover:text-rose-600" title="Удалить тип">✕</button>
            </li>`;
          }).join('')}
        </ul>
        <div class="flex gap-1.5 mt-2">
          <input type="text" data-new-title="${ci}" maxlength="120" placeholder="Новая типовая проблема" class="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
          <button type="button" data-action="cat-add-title" data-ci="${ci}" class="text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-2.5">+</button>
        </div>
      </div>`;
    }).join('') : '<div class="text-sm text-slate-500">Справочник пуст — добавьте категорию.</div>';
  }

  function addCategory() {
    const inp = $('#newCategoryInput');
    const name = inp.value.trim();
    if (!name) { toast('Введите название категории', 'warn'); return; }
    if (state.catalog[name]) { toast('Такая категория уже существует', 'warn'); return; }
    state.catalog[name] = [];
    inp.value = '';
    afterCatalogChange();
    toast(`Категория «${esc(name)}» добавлена`, 'success');
  }

  function addTitle(ci) {
    const cat = Object.keys(state.catalog)[ci];
    const inp = document.querySelector(`[data-new-title="${ci}"]`);
    if (!cat || !inp) return;
    const t = inp.value.trim();
    if (!t) { toast('Введите название типовой проблемы', 'warn'); return; }
    const exists = Object.values(state.catalog).some((arr) => arr.includes(t));
    if (exists) { toast('Такая формулировка уже есть в справочнике — дубли запрещены', 'warn'); return; }
    state.catalog[cat].push(t);
    afterCatalogChange();
    toast('Типовая проблема добавлена в справочник', 'success');
  }

  function deleteTitle(ci, ti) {
    const cat = Object.keys(state.catalog)[ci];
    if (!cat) return;
    const t = state.catalog[cat][ti];
    const used = state.problems.filter((p) => p.title === t).length;
    if (used) { toast(`Нельзя удалить: формулировка используется в ${used} ${plural(used, 'заявке', 'заявках', 'заявках')}`, 'warn'); return; }
    state.catalog[cat].splice(ti, 1);
    afterCatalogChange();
  }

  function deleteCategory(ci) {
    const cat = Object.keys(state.catalog)[ci];
    if (!cat) return;
    const used = state.problems.filter((p) => p.category === cat).length;
    if (used) { toast(`Нельзя удалить категорию: в ней ${used} ${plural(used, 'заявка', 'заявки', 'заявок')}`, 'warn'); return; }
    if (!confirm(`Удалить категорию «${cat}»?`)) return;
    delete state.catalog[cat];
    afterCatalogChange();
  }

  function afterCatalogChange() {
    saveState();
    renderCatalog();
    renderCitizenFormSelects();
    renderFilterOptions();
  }

  // ==========================================================================
  // 10. ГРАФИКИ CHART.JS
  // ==========================================================================
  function ensureCharts() {
    if (rt.chartsInit) return;
    if (typeof window.Chart === 'undefined') {
      ['chartScatter', 'chartCompare', 'chartBudget'].forEach((id) => {
        const c = document.getElementById(id);
        if (c && c.parentElement && !c.parentElement.dataset.fallback) {
          c.parentElement.dataset.fallback = '1';
          c.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-sm text-slate-400 text-center p-4">Chart.js не загружен (нет доступа к CDN)</div>';
        }
      });
      return;
    }
    if ($('#chartScatter').offsetParent === null) return; // панель скрыта — создадим позже
    rt.chartsInit = true;
    const Chart = window.Chart;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = '#475569';
    Chart.defaults.font.size = 11;

    const onPointClick = (evt, els, chart) => {
      if (!els || !els.length) return;
      const el = els[0];
      const d = chart.data.datasets[el.datasetIndex].data[el.index];
      const id = d && d.id ? d.id : (chart.$ids || [])[el.index];
      if (id) openExplain(id);
    };

    rt.charts.scatter = new Chart($('#chartScatter'), {
      type: 'bubble',
      data: {
        datasets: [
          { label: 'Первостепенные (в бюджете)', data: [], backgroundColor: 'rgba(5,150,105,0.55)', borderColor: '#059669', borderWidth: 1.5 },
          { label: 'Второстепенные (дефицит)', data: [], backgroundColor: 'rgba(245,158,11,0.5)', borderColor: '#d97706', borderWidth: 1.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        onClick: onPointClick,
        scales: {
          x: { beginAtZero: true, title: { display: true, text: 'Стоимость, млн ₸' }, grid: { color: '#f1f5f9' } },
          y: { suggestedMin: 0, suggestedMax: 105, title: { display: true, text: 'Итоговый балл (0–100)' }, grid: { color: '#f1f5f9' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = ctx.raw;
                return [`#${d.rank} ${truncate(d.title, 46)}`, `Стоимость: ${fmt(d.x, 1)} млн ₸ • Балл: ${fmt(d.y, 1)}`, `Охват: ${fmt(d.pop)} чел.`];
              }
            }
          }
        }
      }
    });

    rt.charts.compare = new Chart($('#chartCompare'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Пользовательская формула', data: [], backgroundColor: '#4f46e5', borderRadius: 3 },
          { label: 'TOPSIS (эталон)', data: [], backgroundColor: '#94a3b8', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        onClick: onPointClick,
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 70, minRotation: 45, font: { size: 9 } }, grid: { display: false } },
          y: { min: 0, max: 100, title: { display: true, text: 'Балл (лидер = 100)' }, grid: { color: '#f1f5f9' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              title: (items) => {
                const ch = rt.charts.compare;
                const id = ch && ch.$ids ? ch.$ids[items[0].dataIndex] : null;
                const p = id ? getProblem(id) : null;
                return p ? truncate(p.title, 60) : items[0].label;
              },
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 1)}`
            }
          }
        }
      }
    });

    rt.charts.budget = new Chart($('#chartBudget'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Выделено, млн ₸', data: [], backgroundColor: '#059669', borderRadius: 3 },
          { label: 'Дефицит, млн ₸', data: [], backgroundColor: '#f59e0b', borderRadius: 3 }
        ]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { stacked: true, beginAtZero: true, title: { display: true, text: 'млн ₸' }, grid: { color: '#f1f5f9' } },
          y: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.x, 1)}` } }
        }
      }
    });
  }

  function updateCharts() {
    if (!rt.chartsInit) return;
    const rows = rt.ranking.rows;
    const maxPop = Math.max(1, ...rows.map((r) => E.rawValue(r.item, 'population')));
    const point = (r) => ({
      x: E.rawValue(r.item, 'cost'), y: +r.score.toFixed(2),
      r: 5 + 16 * Math.sqrt(E.rawValue(r.item, 'population') / maxPop),
      id: r.id, title: r.item.title, rank: r.rank, pop: r.item.population
    });
    const sc = rt.charts.scatter;
    sc.data.datasets[0].data = rows.filter((r) => isFunded(r.id)).map(point);
    sc.data.datasets[1].data = rows.filter((r) => !isFunded(r.id)).map(point);
    sc.update('none');

    const cmp = rt.charts.compare;
    cmp.$ids = rows.map((r) => r.id);
    cmp.data.labels = rows.map((r) => `#${r.rank} ${shortLabel(r.item, 18)}`);
    cmp.data.datasets[0].data = rows.map((r) => +r.score.toFixed(2));
    cmp.data.datasets[1].data = rows.map((r) => {
      const t = rt.topsis.byId[r.id];
      return t ? +t.score.toFixed(2) : 0;
    });
    cmp.update('none');

    const bc = rt.charts.budget;
    const byCat = rt.allocation.byCategory;
    const cats = Object.keys(state.catalog).filter((c) => byCat[c]);
    Object.keys(byCat).forEach((c) => { if (!cats.includes(c)) cats.push(c); });
    bc.data.labels = cats.map((c) => truncate(c, 22));
    bc.data.datasets[0].data = cats.map((c) => +byCat[c].funded.toFixed(1));
    bc.data.datasets[1].data = cats.map((c) => +byCat[c].deficit.toFixed(1));
    bc.update('none');
  }

  // ==========================================================================
  // 11. КАРТА MAPLIBRE GL JS
  // ==========================================================================
  function buildMapStyle() {
    return {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: 'offline-bg', type: 'background', paint: { 'background-color': '#f1f5f9' } },
        { id: 'osm', type: 'raster', source: 'osm' }
      ]
    };
  }

  const emptyFC = () => ({ type: 'FeatureCollection', features: [] });

  function initMap() {
    if (typeof window.maplibregl === 'undefined') {
      $('#mapFallback').classList.remove('hidden');
      return;
    }
    try {
      rt.map = new window.maplibregl.Map({
        container: 'map',
        style: buildMapStyle(),
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        minZoom: 10,
        maxZoom: 18.5
      });
    } catch (e) {
      console.warn('[CityMind] Карта не инициализирована:', e);
      $('#mapFallback').classList.remove('hidden');
      rt.map = null;
      return;
    }
    const map = rt.map;
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new window.maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('error', () => { /* офлайн: тайлы недоступны — работает векторная схема */ });
    map.on('load', () => {
      addCityLayers();
      rt.mapReady = true;
      renderMapData();
      renderPreviewLayer();
    });
    map.on('click', onMapClick);
    updateMapRoleUi();
  }

  function addCityLayers() {
    const map = rt.map;
    map.addSource('city', { type: 'geojson', data: D.EKIBASTUZ_GEOJSON });
    const isBoundary = ['==', ['get', 'kind'], 'boundary'];
    const isRoad = ['==', ['get', 'kind'], 'arterial'];
    map.addLayer({ id: 'city-fill', type: 'fill', source: 'city', filter: isBoundary, paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.035 } });
    map.addLayer({ id: 'city-outline', type: 'line', source: 'city', filter: isBoundary, paint: { 'line-color': '#6366f1', 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'city-roads-casing', type: 'line', source: 'city', filter: isRoad, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.75 } });
    map.addLayer({ id: 'city-roads', type: 'line', source: 'city', filter: isRoad, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#64748b', 'line-width': 3, 'line-opacity': 0.5 } });

    map.addSource('clusters', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'clusters-fill', type: 'fill', source: 'clusters',
      paint: { 'fill-color': ['match', ['get', 'status'], 'pending', '#7c3aed', ['get', 'color']], 'fill-opacity': 0.14 }
    });
    map.addLayer({
      id: 'clusters-line', type: 'line', source: 'clusters',
      paint: { 'line-color': ['match', ['get', 'status'], 'pending', '#7c3aed', ['get', 'color']], 'line-width': 1.5, 'line-opacity': 0.7 }
    });

    map.addSource('preview', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'preview-fill', type: 'fill', source: 'preview', paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.06 } });
    map.addLayer({ id: 'preview-line', type: 'line', source: 'preview', paint: { 'line-color': '#4f46e5', 'line-width': 2, 'line-dasharray': [2, 2] } });

    // Подписи магистралей (HTML — не требуют шрифтов-глифов из интернета)
    D.EKIBASTUZ_GEOJSON.features.filter((f) => f.properties.kind === 'arterial').forEach((f) => {
      const c = f.geometry.coordinates;
      const mid = c.length >= 3 ? c[Math.floor(c.length / 2)] : [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
      const pos = c.length >= 3
        ? [(mid[0] + c[c.length - 1][0]) / 2, (mid[1] + c[c.length - 1][1]) / 2]
        : mid;
      const el = document.createElement('div');
      el.className = 'cm-road-label';
      el.textContent = f.properties.name;
      rt.roadLabels.push(new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pos).addTo(map));
    });
  }

  function markerSignature(p) {
    const r = rt.rowById[p.id];
    let cls = 'cm-marker ';
    if (p.status === 'pending') cls += 'cm-pending';
    else cls += isFunded(p.id) ? 'cm-funded' : 'cm-deficit';
    if (isCritical(p)) cls += ' cm-critical';
    if (p.id === state.selectedProblemId) cls += ' cm-selected';
    const label = r ? String(r.rank) : '?';
    const badge = (p.mergedCount || 1) > 1 ? `<span class="cm-badge">×${p.mergedCount}</span>` : '';
    return { cls, html: `<span>${label}</span>${badge}` };
  }

  function renderMapData() {
    if (!rt.map) return;
    const map = rt.map;
    const visible = state.problems.filter(passesFilters);
    const seen = new Set();
    visible.forEach((p) => {
      seen.add(p.id);
      let entry = rt.markers.get(p.id);
      if (!entry) {
        const root = document.createElement('div');
        root.className = 'cm-marker-root';
        const inner = document.createElement('div');
        root.appendChild(inner);
        const id = p.id;
        root.addEventListener('click', (ev) => { ev.stopPropagation(); onMarkerClick(id); });
        const marker = new window.maplibregl.Marker({ element: root, anchor: 'center' }).setLngLat(p.coords).addTo(map);
        entry = { marker, root, inner, sig: '' };
        rt.markers.set(p.id, entry);
      } else {
        const ll = entry.marker.getLngLat();
        if (ll.lng !== p.coords[0] || ll.lat !== p.coords[1]) entry.marker.setLngLat(p.coords);
      }
      const s = markerSignature(p);
      const sig = s.cls + s.html;
      if (entry.sig !== sig) {
        entry.inner.className = s.cls;
        entry.inner.innerHTML = s.html;
        entry.inner.title = p.title;
        entry.sig = sig;
      }
      entry.root.style.zIndex = p.id === state.selectedProblemId ? '5' : (p.status === 'pending' ? '2' : '3');
    });
    rt.markers.forEach((entry, id) => {
      if (!seen.has(id)) { entry.marker.remove(); rt.markers.delete(id); }
    });

    if (rt.mapReady) {
      const features = visible
        .filter((p) => (p.mergedCount || 1) > 1)
        .map((p) => ({
          type: 'Feature',
          properties: { id: p.id, status: p.status, color: isFunded(p.id) ? '#059669' : '#f59e0b' },
          geometry: { type: 'Polygon', coordinates: [E.circlePolygon(p.coords, Math.max(Number(p.clusterRadius) || 0, 25))] }
        }));
      const src = map.getSource('clusters');
      if (src) src.setData({ type: 'FeatureCollection', features });
    }
  }

  function renderPreviewLayer() {
    if (!rt.map || !rt.mapReady) return;
    const src = rt.map.getSource('preview');
    if (!src) return;
    if (state.activeRole !== 'evaluator' || !rt.preview || !(state.clusterRadiusMeters > 0)) {
      src.setData(emptyFC());
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: rt.preview.groups.map((g) => ({
        type: 'Feature', properties: { id: g.id },
        geometry: { type: 'Polygon', coordinates: [E.circlePolygon(g.center, state.clusterRadiusMeters)] }
      }))
    });
  }

  function updateMapRoleUi() {
    const citizen = state.activeRole === 'citizen';
    $('#mapHint').classList.toggle('hidden', !citizen || !rt.map);
    const mapEl = $('#map');
    mapEl.classList.toggle('map-crosshair', citizen);
    if (rt.pickMarker) {
      if (citizen && rt.pickCoords) rt.pickMarker.addTo(rt.map);
      else rt.pickMarker.remove();
    }
    renderPreviewLayer();
  }

  function onMapClick(e) {
    const t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest('.cm-marker-root')) return;
    if (state.activeRole !== 'citizen') return;
    setPickCoords([E.round6(e.lngLat.lng), E.round6(e.lngLat.lat)]);
  }

  function setPickCoords(c) {
    if (!inCity(c)) {
      toast('Точка вне территории г. Экибастуз — выберите место в пределах города.', 'warn');
      return;
    }
    rt.pickCoords = c;
    if (rt.map) {
      if (!rt.pickMarker) {
        const el = document.createElement('div');
        el.className = 'cm-pick';
        rt.pickMarker = new window.maplibregl.Marker({ element: el, anchor: 'center' });
      }
      rt.pickMarker.setLngLat(c);
      if (state.activeRole === 'citizen') rt.pickMarker.addTo(rt.map);
    }
    $('#mapHint').classList.add('hidden');
    renderCitizenCoords();
    renderNearbyHint();
  }

  function onMarkerClick(id) {
    state.selectedProblemId = id;
    saveSoon();
    showPopup(id);
    renderMapData();
    if (state.activeRole === 'admin') renderRankingTable();
  }

  function popupHtml(p) {
    const r = rt.rowById[p.id];
    const role = state.activeRole;
    let actions = '';
    if (role === 'citizen') {
      actions = `<button type="button" data-action="vote" data-id="${esc(p.id)}" class="flex-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5">👍 Поддержать проблему (+1 голос)</button>`;
    } else if (role === 'evaluator') {
      actions = p.status === 'pending'
        ? `<button type="button" data-action="evaluate" data-id="${esc(p.id)}" class="flex-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5">🛠 Экспертиза</button>
           <button type="button" data-action="reject" data-id="${esc(p.id)}" class="text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 px-2 py-1.5">Отклонить</button>`
        : `<button type="button" data-action="evaluate" data-id="${esc(p.id)}" class="flex-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5">Редактировать паспорт</button>`;
    } else {
      actions = `<button type="button" data-action="explain" data-id="${esc(p.id)}" class="flex-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5">🔍 Почему такое место? (XAI)</button>`;
    }
    const photo = (p.photos || []).length
      ? `<button type="button" data-action="photo" data-id="${esc(p.id)}" data-index="0" class="block w-full h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 relative">
           <img src="${esc(p.photos[0])}" alt="Фото" class="w-full h-full object-cover" />
           <span class="absolute bottom-1 right-1 text-[10px] font-semibold bg-black/60 text-white rounded px-1.5">📷 ${p.photos.length}</span>
         </button>` : '';
    return `
      <div class="text-[13px] space-y-1.5 w-[250px] max-w-full">
        <div class="flex flex-wrap gap-1">${statusBadge(p)}${criticalBadge(p)}</div>
        <div class="font-semibold text-slate-900 leading-snug">${esc(p.title)}</div>
        <div class="text-[11px] text-slate-500">${esc(p.category)}${(p.mergedCount || 1) > 1 ? ` • кластер ×${p.mergedCount}, R≈${p.clusterRadius} м` : ''}</div>
        <div class="text-xs text-slate-600 line-clamp-3">${esc(p.details)}</div>
        ${photo}
        <div class="grid grid-cols-3 gap-1 text-center">
          <div class="rounded-md bg-violet-50 py-1"><div class="text-[10px] text-slate-500">Голоса</div><div class="font-bold text-violet-700 tabular">${fmt(p.votes)}</div></div>
          <div class="rounded-md bg-indigo-50 py-1"><div class="text-[10px] text-slate-500">Место</div><div class="font-bold text-indigo-700 tabular">${r ? '#' + r.rank : '—'}</div></div>
          <div class="rounded-md bg-slate-50 py-1"><div class="text-[10px] text-slate-500">Балл</div><div class="font-bold text-slate-800 tabular">${r ? fmt(r.score, 1) : '—'}</div></div>
        </div>
        <div class="flex gap-1.5 pt-0.5">${actions}</div>
      </div>`;
  }

  function showPopup(id) {
    const p = getProblem(id);
    if (!rt.map || !p) return;
    if (rt.popup) rt.popup.remove();
    rt.popupId = id;
    rt.popup = new window.maplibregl.Popup({ offset: 20, maxWidth: '290px', closeButton: true, focusAfterOpen: false })
      .setLngLat(p.coords).setHTML(popupHtml(p)).addTo(rt.map);
    const thisPopup = rt.popup;
    thisPopup.on('close', () => {
      if (rt.popup === thisPopup) { rt.popup = null; rt.popupId = null; }
    });
  }

  function refreshPopup() {
    if (!rt.popup || !rt.popupId) return;
    const p = getProblem(rt.popupId);
    if (!p || !passesFilters(p)) { rt.popup.remove(); return; }
    rt.popup.setLngLat(p.coords).setHTML(popupHtml(p));
  }

  function focusOnMap(id) {
    const p = getProblem(id);
    if (!p) return;
    state.selectedProblemId = id;
    const card = $('#mapCard');
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!rt.map) { toast('Карта недоступна', 'warn'); return; }
    if (!passesFilters(p)) {
      state.categoryFilter = 'all';
      state.statusFilter = 'all';
      renderFilterOptions();
    }
    renderMapData();
    rt.map.flyTo({ center: p.coords, zoom: Math.max(rt.map.getZoom(), 15.2), speed: 1.4 });
    rt.map.once('moveend', () => showPopup(id));
  }

  // ==========================================================================
  // 12. СЖАТИЕ ФОТОГРАФИЙ ЧЕРЕЗ <CANVAS> И ВОДЯНОЙ ЗНАК
  // ==========================================================================
  function compressImage(file, coords) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Повреждённый файл изображения'));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let w = img.width;
            let h = img.height;
            if (w > PHOTO_MAX_WIDTH) {
              h = Math.round((h * PHOTO_MAX_WIDTH) / w);
              w = PHOTO_MAX_WIDTH;
            }
            canvas.width = w;
            canvas.height = h;

            // Отрисовка исходного изображения
            ctx.drawImage(img, 0, 0, w, h);

            // Нанесение водяного знака в нижней части снимка (Раздел 4, Роль 1)
            const barHeight = Math.max(28, Math.round(h * 0.08));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(0, h - barHeight, w, barHeight);

            ctx.fillStyle = '#38bdf8';
            ctx.font = `bold ${Math.max(10, Math.round(barHeight * 0.38))}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const cText = coords ? coordsText(coords) : 'г. Экибастуз';
            const stamp = `CityMind Экибастуз | ${todayISO()} | GPS: ${cText}`;
            ctx.fillText(stamp, 10, h - barHeight / 2);

            const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoFiles(files) {
    if (!files || !files.length) return;
    const remainingSlots = MAX_PHOTOS - rt.pendingPhotos.length;
    if (remainingSlots <= 0) {
      toast(`Максимум ${MAX_PHOTOS} фотографий к одной заявке`, 'warn');
      return;
    }
    const toProcess = Array.from(files).slice(0, remainingSlots);
    toast('Сжатие фотографий и нанесение водяного знака...', 'info', 2000);
    for (const f of toProcess) {
      try {
        const url = await compressImage(f, rt.pickCoords);
        rt.pendingPhotos.push({ file: f, url });
      } catch (e) {
        console.warn('Ошибка сжатия фото:', e);
        toast(`Ошибка обработки файла ${f.name}`, 'warn');
      }
    }
    renderPhotoPreviews();
  }

  // ==========================================================================
  // 13. МОДАЛЬНЫЕ ОКНА: ЛАЙТБОКС, ЭКСПЕРТИЗА, ОТКЛОНЕНИЕ, XAI-ОБЪЯСНЕНИЕ
  // ==========================================================================

  // ---------- Лайтбокс ----------
  function openLightbox(id, index) {
    const p = getProblem(id);
    if (!p || !p.photos || !p.photos.length) {
      toast('У этой проблемы нет прикреплённых фото', 'info');
      return;
    }
    rt.lightbox.item = p;
    rt.lightbox.photos = p.photos;
    rt.lightbox.index = clamp(Number(index) || 0, 0, p.photos.length - 1);
    renderLightbox();
    openModal('modalLightbox');
  }

  function renderLightbox() {
    const { item, photos, index } = rt.lightbox;
    if (!item || !photos.length) return;
    const src = photos[index];
    const img = $('#lbImg');
    img.src = src;
    $('#lbStamp').textContent = `✓ Верифицировано CityMind • Фото ${index + 1} из ${photos.length}`;
    $('#lbCaption').innerHTML = `
      <div class="font-bold text-white text-sm sm:text-base">${esc(item.title)}</div>
      <div class="text-xs text-slate-300 mt-1">${esc(item.details)}</div>
      <div class="text-[11px] text-slate-400 mt-0.5">Координаты: ${coordsText(item.coords)} | Дата: ${ruDate(item.createdAt)} | Статус: ${item.status}</div>`;
    $('#lbPrev').style.visibility = photos.length > 1 ? 'visible' : 'hidden';
    $('#lbNext').style.visibility = photos.length > 1 ? 'visible' : 'hidden';
  }

  function nextLightbox(dir) {
    const lb = rt.lightbox;
    if (!lb.photos.length) return;
    lb.index = (lb.index + dir + lb.photos.length) % lb.photos.length;
    renderLightbox();
  }

  // ---------- Экспертиза (Оценщик) ----------
  function openEvaluate(id) {
    const p = getProblem(id);
    if (!p) return;
    rt.evalId = id;
    $('#evHeader').innerHTML = `
      <div class="flex items-center gap-2 mb-1">${statusBadge(p)}${trustBadge(p)}</div>
      <h4 class="font-bold text-slate-900 text-sm sm:text-base leading-snug">${esc(p.title)}</h4>
      <div class="text-xs text-slate-500 mt-0.5">${esc(p.category)} • 📍 ${coordsText(p.coords)}</div>
      <div class="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-2">${detailsList(p)}</div>`;

    $('#evSeverity').value = p.severity;
    $('#evSeverityVal').textContent = p.severity;
    $('#evUrgency').value = p.urgency;
    $('#evUrgencyVal').textContent = p.urgency;
    $('#evFeasibility').value = p.feasibility;
    $('#evFeasibilityVal').textContent = p.feasibility;
    $('#evPopulation').value = p.population;
    $('#evCost').value = p.cost;
    $('#evGisNote').textContent = '';

    openModal('modalEval');
  }

  function applyGisEstimate() {
    if (!rt.evalId) return;
    const p = getProblem(rt.evalId);
    if (!p) return;
    const est = E.estimatePopulation(p.coords);
    $('#evPopulation').value = est.population;
    $('#evGisNote').innerHTML = `<span class="text-indigo-600 font-semibold">✓ Расчёт выполнен:</span> ${est.population.toLocaleString('ru-RU')} чел. (${est.density}, ориентир: ${est.zone})`;
    toast(`ГИС-оценка подставлена: ${est.population} чел.`, 'info');
  }

  function submitEvaluation() {
    if (!rt.evalId) return;
    const p = getProblem(rt.evalId);
    if (!p) return;

    const sev = clamp(parseInt($('#evSeverity').value, 10) || 5, 1, 10);
    const urg = clamp(parseInt($('#evUrgency').value, 10) || 5, 1, 10);
    const feas = clamp(parseInt($('#evFeasibility').value, 10) || 5, 1, 10);
    const pop = Math.max(0, parseInt($('#evPopulation').value, 10) || 0);
    const cost = Math.max(0.01, parseFloat($('#evCost').value) || 0.01);

    p.severity = sev;
    p.urgency = urg;
    p.feasibility = feas;
    p.population = pop;
    p.cost = +(cost.toFixed(1));
    p.status = 'evaluated';
    p.rejectReason = '';

    closeModal('modalEval');
    saveState();
    updateNow();
    toast(`Паспорт «${truncate(p.title, 35)}» утверждён и включён в рейтинг!`, 'success');
  }

  // ---------- Отклонение заявки ----------
  function openReject(id) {
    const p = getProblem(id);
    if (!p) return;
    rt.rejectId = id;
    $('#rjTitle').innerHTML = `Отклонение заявки: <b class="text-slate-900">${esc(p.title)}</b><div class="text-xs text-slate-500 mt-1">${esc(shortLabel(p, 50))}</div>`;
    const sel = $('#rjReason');
    sel.innerHTML = REJECT_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    $('#rjComment').value = '';
    openModal('modalReject');
  }

  function submitReject() {
    if (!rt.rejectId) return;
    const p = getProblem(rt.rejectId);
    if (!p) return;
    const reason = $('#rjReason').value;
    const comm = $('#rjComment').value.trim();
    p.status = 'rejected';
    p.rejectReason = comm ? `${reason} (${comm})` : reason;

    closeModal('modalReject');
    saveState();
    updateNow();
    toast('Заявка отклонена и перемещена в архив', 'info');
  }

  function restoreProblem(id) {
    const p = getProblem(id);
    if (!p) return;
    p.status = 'pending';
    p.rejectReason = '';
    saveState();
    updateNow();
    toast(`Заявка «${truncate(p.title, 35)}» возвращена в очередь модерации`, 'success');
  }

  // ---------- XAI Explainable AI Заключение (Раздел 4.3 & 5.3) ----------
  function openExplain(id) {
    rt.explainId = id;
    $('#explainBody').innerHTML = explainHtml(id);
    openModal('modalExplain');
  }

  function explainHtml(id) {
    const p = getProblem(id);
    if (!p) return '<div class="text-sm text-slate-500">Проблема не найдена.</div>';
    const r = rt.rowById[id];
    if (!r) {
      return `
        <div class="space-y-3">
          <div class="flex items-center gap-2">${statusBadge(p)}</div>
          <h4 class="font-bold text-slate-900">${esc(p.title)}</h4>
          <p class="text-sm text-slate-600">Проблема имеет статус <b>${p.status}</b> и пока не участвует в общем рейтинге.</p>
          ${p.status === 'pending' ? '<button type="button" data-action="evaluate" data-id="' + esc(p.id) + '" class="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold">Провести экспертизу</button>' : ''}
        </div>`;
    }

    const t = rt.topsis.byId[id];
    const funded = isFunded(id);
    const sortedFactors = FACTORS.slice().sort((a, b) => r.contributions[b] - r.contributions[a]);
    const leadF = sortedFactors[0];
    const secondF = sortedFactors[1];

    // Нахождение соседа снизу для сравнительного анализа (Раздел 4, п. 4)
    const nextRow = rt.ranking.rows.find((x) => x.rank === r.rank + 1);
    let nextComparisonHtml = '';
    if (nextRow) {
      const np = nextRow.item;
      const advantages = [];
      if (p.severity > np.severity) advantages.push(`серьёзности (${p.severity} vs ${np.severity})`);
      if (p.urgency > np.urgency) advantages.push(`срочности (${p.urgency} vs ${np.urgency})`);
      if (p.population > np.population) advantages.push(`охвату жителей (${fmt(p.population)} vs ${fmt(np.population)})`);
      if (p.feasibility > np.feasibility) advantages.push(`лёгкости реализации (${p.feasibility} vs ${np.feasibility})`);
      if (p.votes > np.votes) advantages.push(`резонансу жителей (${fmt(p.votes)} vs ${fmt(np.votes)} гол.)`);
      if (p.cost < np.cost) advantages.push(`более низкой стоимости (${fmt(p.cost, 1)} vs ${fmt(np.cost, 1)} млн ₸)`);

      nextComparisonHtml = `
        <div class="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 mt-3 text-xs sm:text-sm text-slate-700">
          <div class="font-bold text-indigo-950 flex items-center gap-1.5 mb-1">
            <span>⚖️ Сравнение с проблемой #${nextRow.rank}</span>
          </div>
          <p>
            Проблема опережает «<b>${esc(truncate(np.title, 50))}</b>» на <b>${fmt(r.score - nextRow.score, 1)} балла</b>.
            ${advantages.length ? `Ключевые преимущества текущей задачи: превосходство по ${advantages.join(', ')}.` : 'Опережение обеспечено совокупным весовым балансом факторов.'}
          </p>
        </div>`;
    }

    // Анализ совпадения с методом TOPSIS
    const topsisDiff = t ? t.rank - r.rank : 0;
    let topsisNote = '';
    if (!t) {
      topsisNote = 'Рейтинг TOPSIS недоступен.';
    } else if (topsisDiff === 0) {
      topsisNote = `Идеальное совпадение: эталонный метод TOPSIS также ставит эту проблему на <b>место #${t.rank}</b> (относительная близость C* = ${t.closeness.toFixed(3)}).`;
    } else if (topsisDiff > 0) {
      topsisNote = `В пользовательской формуле задача стоит выше, чем в TOPSIS (в TOPSIS она на <b>#${t.rank}</b> месте, смещение: ▲ +${topsisDiff}). Это вызвано тем, что текущая формула усиливает влияние факторов «${META[leadF].label}» и «${META[secondF].label}».`;
    } else {
      topsisNote = `В эталонном TOPSIS эта задача занимает более высокую позицию <b>#${t.rank}</b> (смещение: ▼ ${topsisDiff}), так как в многомерном векторном пространстве она ближе к идеальной точке $A^+$.`;
    }

    return `
      <div class="space-y-4 text-slate-800 text-sm">
        <!-- Заголовок паспорта -->
        <div class="border-b border-slate-200 pb-3">
          <div class="flex flex-wrap items-center gap-2 mb-1.5">
            <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-white font-bold text-sm ${funded ? 'bg-emerald-600' : 'bg-amber-500'}">
              Ранг #${r.rank}
            </span>
            ${statusBadge(p)}
            ${criticalBadge(p)}
            <span class="text-xs text-slate-500">Балл: <b class="text-slate-900">${fmt(r.score, 1)} / 100</b> (сырой Y<sub>i</sub> = ${fmt(r.raw, 4)})</span>
          </div>
          <h4 class="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">${esc(p.title)}</h4>
          <div class="text-xs text-slate-500 mt-1">${esc(p.category)} • 📍 GPS: ${coordsText(p.coords)} • ${trustBadge(p)}</div>
          <p class="text-xs sm:text-sm text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">${detailsList(p)}</p>
        </div>

        <!-- Аналитический вывод естественным языком -->
        <div>
          <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Аналитическое заключение системы (Explainable AI)</h5>
          <p class="text-xs sm:text-sm text-slate-700 leading-relaxed">
            Проблема заняла <b class="text-indigo-700">место #${r.rank}</b> в итоговом общегородском рейтинге г. Экибастуз с результатом <b>${fmt(r.score, 1)} баллов</b>.
            Главным драйвером высокой позиции стал фактор <b style="color:${META[leadF].color}">«${META[leadF].label}»</b>, давший <b>${fmt(r.contributions[leadF], 1)}%</b> общего математического вклада (метод пофакторного исключения Marginal Ablation).
            Вторым по значимости фактором выступил <b style="color:${META[secondF].color}">«${META[secondF].label}»</b> с вкладом <b>${fmt(r.contributions[secondF], 1)}%</b>.
          </p>
        </div>

        <!-- Декомпозиция факторов (Таблица + прогресс-бары) -->
        <div>
          <div class="text-xs font-bold text-slate-600 mb-2">Декомпозиция влияния факторов на итоговый балл (Marginal Ablation):</div>
          <div class="space-y-2">
            ${sortedFactors.map((f) => {
              const meta = META[f];
              const pct = r.contributions[f];
              const val = valueText(f, p[f]);
              return `
              <div>
                <div class="flex justify-between text-xs mb-0.5">
                  <span class="font-semibold flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-sm inline-block" style="background:${meta.color}"></span>
                    ${meta.label} (${meta.short} = ${val})
                  </span>
                  <span class="font-bold tabular text-slate-800">${fmt(pct, 1)}%</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div class="h-full rounded-full transition-all" style="width:${pct.toFixed(1)}%;background:${meta.color}"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Сравнение с соседней проблемой -->
        ${nextComparisonHtml}

        <!-- Сравнение с эталонным методом TOPSIS -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs sm:text-sm text-slate-700">
          <div class="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
            <span>📐 Сопоставление с эталонным научным методом TOPSIS</span>
          </div>
          <p>${topsisNote}</p>
        </div>

        <!-- Бюджетный вердикт -->
        <div class="rounded-xl p-3.5 text-xs sm:text-sm ${funded ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}">
          <b>Управленческий статус решения:</b>
          ${funded
            ? `Задача включена в первоочередной план финансирования (смета: <b>${fmt(p.cost, 1)} млн ₸</b> покрывается утверждённым бюджетом <b>${fmt(state.budgetLimit)} млн ₸</b>).`
            : `Задача находится в зоне дефицита бюджета (для её включения требуется расширение городского лимита или перераспределение финансирования).`}
        </div>
      </div>`;
  }

  // ==========================================================================
  // 14. ГОЛОСОВАНИЕ, СОЗДАНИЕ ЗАЯВОК И КЛАСТЕРИЗАЦИЯ
  // ==========================================================================

  // ---------- Голосование жителя ----------
  function voteProblem(id) {
    const p = getProblem(id);
    if (!p) return;
    p.votes = (Number(p.votes) || 0) + 1;
    saveState();
    updateNow();
    toast(`Голос учтён! У проблемы «${truncate(p.title, 35)}» теперь ${fmt(p.votes)} ${plural(p.votes, 'голос', 'голоса', 'голосов')}.`, 'success');
  }

  // ---------- Отправка заявки жителем ----------
  async function submitCitizenProblem(e) {
    e.preventDefault();
    const cat = $('#fCategory').value;
    const title = $('#fTitle').value;
    const details = $('#fDetails').value.trim();

    if (!cat) { toast('Выберите категорию проблемы', 'warn'); return; }
    if (!title) { toast('Выберите типовое наименование проблемы из справочника', 'warn'); return; }
    if (!details || details.length < 10) {
      toast('Опишите проблему подробнее (укажите адрес, дом или ориентир, не менее 10 символов)', 'warn');
      return;
    }
    if (!rt.pickCoords) {
      toast('Укажите место проблемы кликом по карте Экибастуза', 'warn');
      $('#mapCard').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const coords = [rt.pickCoords[0], rt.pickCoords[1]];
    let photos = rt.pendingPhotos.map((p) => p.url);

    // Если фото не загружены, создаём красивую векторную офлайн-иллюстрацию
    if (!photos.length) {
      photos = [D.generatePresetPhotoSVG(cat, 'СИГНАЛ ЖИТЕЛЯ', truncate(details, 30), coords, ruDate(todayISO()), 'ОБРАЩЕНИЕ')];
    }

    const newProblem = normalizeProblem({
      id: 'prob_' + uid(),
      category: cat,
      title: title,
      details: details,
      coords: coords,
      status: 'pending',
      rejectReason: '',
      createdAt: todayISO(),
      photos: photos,
      mergedCount: 1,
      clusterRadius: 0,
      sourcePoints: [coords],
      sourceDetails: [details],
      votes: 1,
      // Предварительные средние параметры (будут уточнены Оценщиком):
      severity: 6,
      urgency: 6,
      population: E.estimatePopulation(coords).population,
      cost: 15.0,
      feasibility: 7
    });

    state.problems.unshift(newProblem);

    // Проверка наличия близких однотипных заявок для подсказки
    const nearby = findNearbySameTitle(title, coords, newProblem.id);

    // Очистка формы
    $('#fDetails').value = '';
    rt.pendingPhotos = [];
    rt.pickCoords = null;
    if (rt.pickMarker) rt.pickMarker.remove();
    renderPhotoPreviews();
    renderCitizenCoords();

    saveState();
    updateNow();

    if (nearby.length > 0) {
      toast(`Заявка принята! В радиусе ${state.clusterRadiusMeters} м есть похожие заявки — коммунальная служба сможет объединить их в один кластер.`, 'success', 6000);
    } else {
      toast('Ваша заявка успешно отправлена на модерацию в службу акимата г. Экибастуз!', 'success');
    }

    focusOnMap(newProblem.id);
  }

  // ---------- Кластеризация (Оценщик) ----------
  function runClusterMerge() {
    const R = state.clusterRadiusMeters;
    if (!(R > 0)) {
      toast('Укажите радиус объединения R > 0 метров', 'warn');
      return;
    }
    const res = E.clusterProblems(state.problems, R);
    if (!res.merges) {
      toast(`В радиусе R = ${R} м нет подходящих заявок для объединения`, 'info');
      return;
    }
    state.problems = res.problems;
    saveState();
    updateNow();
    toast(`Выполнено объединение: ${res.merges} ${plural(res.merges, 'слияние', 'слияния', 'слияний')} (затронуто ${res.involved} заявок)`, 'success');
  }

  function runClusterUnmerge() {
    const res = E.unclusterProblems(state.problems);
    if (!res.split) {
      toast('В текущей базе нет объединённых кластеров для разъединения', 'info');
      return;
    }
    state.problems = res.problems;
    saveState();
    updateNow();
    toast(`Кластеризация сброшена: разъединено ${res.split} ${plural(res.split, 'кластер', 'кластера', 'кластеров')}`, 'success');
  }

  // ==========================================================================
  // 15. УПРАВЛЕНИЕ МОДЕЛЬЮ, ВЕСАМИ, БЮДЖЕТОМ И ТЕСТОВЫМИ ДАННЫМИ
  // ==========================================================================

  function applyPreset(presetId) {
    const p = getPresets().find((x) => x.id === presetId);
    if (!p) return;
    state.selectedPresetId = p.id;
    $('#formulaInput').value = p.formula;
    applyFormulaText(p.formula);
    saveState();
    buildPresetButtons();
    renderPresetState();
    updateNow();
    toast(`Загружена модель: ${p.shortName}`, 'info');
  }

  function movePreset(presetId, dir) {
    const presets = getPresets().slice();
    const idx = presets.findIndex((p) => p.id === presetId);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= presets.length) return;
    const item = presets.splice(idx, 1)[0];
    presets.splice(newIdx, 0, item);
    state.formulaPresets = presets;
    saveState();
    buildPresetButtons();
    renderPresetState();
  }

  function deletePreset(presetId) {
    const presets = getPresets();
    if (presets.length <= 1) {
      toast('Нельзя удалить последнюю оставшуюся модель в списке.', 'warning');
      return;
    }
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    if (!confirm(`Вы действительно хотите удалить модель «${p.name || p.shortName}»?`)) return;

    state.formulaPresets = presets.filter((x) => x.id !== presetId);
    if (state.selectedPresetId === presetId) {
      applyPreset(state.formulaPresets[0].id);
    } else {
      saveState();
      buildPresetButtons();
      renderPresetState();
    }
    toast(`Модель «${p.shortName}» удалена`, 'info');
  }

  function openAddPresetModal(isSaveCurrent) {
    const titleEl = $('#modalPresetTitle');
    const formEl = $('#formNewPreset');
    const formulaEl = $('#presetFormula');
    const fullEl = $('#presetFullName');
    const shortEl = $('#presetShortName');
    const descEl = $('#presetDescription');
    const errEl = $('#presetFormulaError');

    errEl.classList.add('hidden');
    errEl.textContent = '';
    formEl.reset();

    const presets = getPresets();
    const nextNum = presets.length + 1;

    if (isSaveCurrent) {
      titleEl.textContent = 'Сохранить текущую формулу как модель';
      const curFormula = ($('#formulaInput').value || '').trim() || state.customFormula || '';
      formulaEl.value = curFormula;
      fullEl.value = `${nextNum}. Пользовательская модель (${new Date().toLocaleDateString('ru-RU')})`;
      shortEl.value = `Модель ${nextNum}`;
      descEl.value = 'Пользовательская математическая модель приоритетности.';
    } else {
      titleEl.textContent = 'Добавить новую научную модель';
      formulaEl.value = 'wS * S + wU * U + wP * P + wV * V + wF * F + wC * C_inv';
      fullEl.value = `${nextNum}. Новая методика ранжирования`;
      shortEl.value = `Модель ${nextNum}`;
      descEl.value = '';
    }

    openModal('modalPreset');
    setTimeout(() => fullEl.focus(), 50);
  }

  function submitAddPreset(e) {
    e.preventDefault();
    const name = ($('#presetFullName').value || '').trim();
    const shortName = ($('#presetShortName').value || '').trim();
    const formula = ($('#presetFormula').value || '').trim();
    const desc = ($('#presetDescription').value || '').trim();
    const errEl = $('#presetFormulaError');

    if (!formula) {
      errEl.textContent = 'Укажите формулу для вычисления приоритета.';
      errEl.classList.remove('hidden');
      return;
    }

    const c = E.compileFormula(formula, state.weights);
    if (!c.ok) {
      errEl.textContent = 'Синтаксическая ошибка: ' + c.error;
      errEl.classList.remove('hidden');
      return;
    }

    const newPreset = {
      id: 'custom_preset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: name || ('Модель ' + (getPresets().length + 1)),
      shortName: shortName || ('Модель ' + (getPresets().length + 1)),
      description: desc || 'Пользовательская методика ранжирования проектов.',
      formula: formula
    };

    const presets = getPresets().slice();
    presets.push(newPreset);
    state.formulaPresets = presets;

    closeModal('modalPreset');
    applyPreset(newPreset.id);
    toast(`Модель «${newPreset.shortName}» успешно добавлена и активирована!`, 'success');
  }

  function insertToken(token) {
    const ta = $('#formulaInput');
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const oldText = ta.value;
    const newText = oldText.substring(0, start) + token + oldText.substring(end);
    ta.value = newText;
    ta.focus();
    const newPos = start + token.length;
    ta.setSelectionRange(newPos, newPos);
    applyFormulaText(newText);
    saveSoon();
    scheduleUpdate();
  }

  function onFormulaInput(e) {
    const text = e.target.value;
    applyFormulaText(text);
    saveSoon();
    scheduleUpdate();
  }

  function onWeightInput(e) {
    const token = e.target.dataset.weight;
    if (!token) return;
    const val = parseFloat(e.target.value) || 0;
    state.weights[token] = val;
    $('#wv_' + token).textContent = val.toFixed(2);
    saveSoon();
    scheduleUpdate();
  }

  function normalizeWeightsToOne() {
    let sum = 0;
    D.FORMULA_VARIABLES.weights.forEach((w) => {
      sum += Math.max(0, Number(state.weights[w.token]) || 0);
    });
    if (sum <= 0) return;
    D.FORMULA_VARIABLES.weights.forEach((w) => {
      state.weights[w.token] = +((state.weights[w.token] / sum).toFixed(4));
    });
    saveState();
    syncWeightSliders();
    updateNow();
    toast('Весовые коэффициенты нормированы к сумме 1.0', 'success');
  }

  function resetWeightsDefault() {
    state.weights = deepClone(D.DEFAULT_APP_STATE.weights);
    saveState();
    syncWeightSliders();
    updateNow();
    toast('Установлены весовые коэффициенты по умолчанию', 'info');
  }

  function setBudgetLimit(val) {
    state.budgetLimit = clamp(Number(val) || 300, 50, 1000);
    $('#budgetRange').value = state.budgetLimit;
    $('#budgetValue').textContent = fmt(state.budgetLimit);
    saveSoon();
    scheduleUpdate();
  }

  function setBudgetStrategy(strat) {
    if (!['sequential', 'greedy_fill'].includes(strat)) return;
    state.budgetStrategy = strat;
    saveState();
    updateNow();
    toast(`Выбран алгоритм бюджета: ${STRATEGY_LABEL[strat]}`, 'info');
  }

  function captureBaselineSlotA() {
    const rows = rt.ranking.rows;
    if (!rows.length) {
      toast('Нет оценённых проблем для фиксации рейтинга', 'warn');
      return;
    }
    const ranks = {};
    rows.forEach((r) => { ranks[r.id] = r.rank; });
    state.baselineRanks = ranks;
    const d = new Date();
    state.baselineMeta = {
      formulaName: currentFormulaName(),
      count: rows.length,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    };
    saveState();
    updateNow();
    toast(`Базовый рейтинг (Слот А) зафиксирован для ${rows.length} проблем! Теперь вы можете менять формулу или веса для наблюдения за смещениями позиций.`, 'success', 5000);
  }

  function clearBaselineSlot() {
    state.baselineRanks = null;
    state.baselineMeta = null;
    saveState();
    updateNow();
    toast('Слот А очищен', 'info');
  }

  function quickAddTestProblem() {
    const cats = Object.keys(state.catalog);
    const cat = cats[randInt(0, cats.length - 1)] || 'ЖКХ и теплосети';
    const titles = state.catalog[cat] || ['Тестовая проблема'];
    const title = titles[randInt(0, titles.length - 1)];

    // Генерация случайных координат в пределах Экибастуза
    const lng = E.round6(MAP_CENTER[0] + (Math.random() - 0.5) * 0.035);
    const lat = E.round6(MAP_CENTER[1] + (Math.random() - 0.5) * 0.025);
    const coords = [lng, lat];

    const sev = randInt(4, 10);
    const urg = randInt(4, 10);
    const feas = randInt(5, 10);
    const pop = randInt(15, 300) * 100;
    const cost = +(randInt(50, 950) / 10).toFixed(1);
    const votes = randInt(25, 450);

    const testProblem = normalizeProblem({
      id: 'prob_' + uid(),
      category: cat,
      title: title,
      details: `[Тестовая задача]: Проверка устойчивости СППР при добавлении нового объекта в секторе (${lat}, ${lng}).`,
      coords: coords,
      status: 'evaluated',
      rejectReason: '',
      createdAt: todayISO(),
      photos: [D.generatePresetPhotoSVG(cat, 'ТЕСТ СППР', 'Моделирование', coords, ruDate(todayISO()), 'ЭКСПЕРИМЕНТ')],
      mergedCount: 1,
      clusterRadius: 0,
      sourcePoints: [coords],
      sourceDetails: ['Сгенерированная экспертная задача'],
      severity: sev,
      urgency: urg,
      population: pop,
      cost: cost,
      feasibility: feas,
      votes: votes
    });

    state.problems.unshift(testProblem);
    rt.flashId = testProblem.id;
    saveState();
    updateNow();
    toast(`Тестовая проблема «${truncate(title, 35)}» добавлена и включена в рейтинг!`, 'success');

    setTimeout(() => {
      if (rt.flashId === testProblem.id) {
        rt.flashId = null;
        renderRankingTable();
      }
    }, 2500);
  }

  function onTableInlineEdit(e) {
    const inp = e.target;
    const field = inp.dataset.edit;
    const id = inp.dataset.id;
    if (!field || !id) return;
    const p = getProblem(id);
    if (!p) return;

    let v = parseFloat(inp.value);
    if (!Number.isFinite(v)) return;
    if (['severity', 'urgency', 'feasibility'].includes(field)) {
      v = clamp(Math.round(v), 1, 10);
    } else if (field === 'population' || field === 'votes') {
      v = Math.max(0, Math.round(v));
    } else if (field === 'cost') {
      v = Math.max(0.01, +v.toFixed(1));
    }
    p[field] = v;
    saveSoon();
    scheduleUpdate();
  }

  function deleteProblem(id) {
    const p = getProblem(id);
    if (!p) return;
    if (!confirm(`Удалить проблему «${p.title}»?`)) return;
    state.problems = state.problems.filter((x) => x.id !== id);
    if (state.selectedProblemId === id) state.selectedProblemId = null;
    saveState();
    updateNow();
    toast('Проблема удалена', 'info');
  }

  // ==========================================================================
  // 16. ЭКСПОРТ, ИМПОРТ, СБРОС И БАННЕР «О ПРОЕКТЕ»
  // ==========================================================================

  function exportJson() {
    const dump = {
      app: 'CityMind',
      city: 'Экибастуз',
      version: 1.0,
      exportedAt: new Date().toISOString(),
      state: state
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CityMind_Ekibastuz_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
    toast('Данные успешно экспортированы в JSON-файл', 'success');
  }

  function triggerImport() {
    $('#fileImport').click();
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast('Ошибка чтения файла', 'error');
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const importedState = json.state || json;
        if (!importedState || !Array.isArray(importedState.problems)) {
          throw new Error('Файл не содержит корректной структуры CityMind');
        }
        state = mergeIntoState(defaultState(), importedState);
        applyFormulaText(state.customFormula);
        saveState();
        renderAll();
        toast(`Импортировано успешно: ${state.problems.length} проблем`, 'success');
      } catch (err) {
        toast(`Ошибка импорта JSON: ${err.message}`, 'error', 6000);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function resetToPresets() {
    const msg = 'Сбросить все данные к эталонным 16 проблемам г. Экибастуз?\nВсе введённые вручную заявки и изменения будут удалены.';
    if (!confirm(msg)) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    applyFormulaText(state.customFormula);
    saveState();
    renderAll();
    toast('База данных успешно сброшена к эталонным 16 проблемам г. Экибастуз', 'success');
  }

  function toggleAboutPanel() {
    const p = $('#aboutPanel');
    const isHidden = p.classList.contains('hidden');
    p.classList.toggle('hidden', !isHidden);
  }

  // ==========================================================================
  // 17. РОЛЕВОЙ ИНТЕРФЕЙС И НАВИГАЦИЯ
  // ==========================================================================

  function setRole(role) {
    if (!['citizen', 'evaluator', 'admin'].includes(role)) role = 'admin';
    state.activeRole = role;
    saveSoon();

    // Переключение кнопок в шапке
    $$('#roleSwitcher button').forEach((btn) => {
      const active = btn.dataset.roleBtn === role;
      btn.className = ROLE_BTN_BASE + (active ? ROLE_BTN_ON : ROLE_BTN_OFF);
    });

    // Переключение панелей на странице
    $$('[data-role-panel]').forEach((panel) => {
      const show = panel.dataset.rolePanel === role;
      panel.classList.toggle('hidden', !show);
    });

    updateMapRoleUi();
    renderActiveRole();

    // Прокрутка при необходимости
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  // ==========================================================================
  // 18. ДЕЛЕГИРОВАНИЕ СОБЫТИЙ И ИНИЦИАЛИЗАЦИЯ
  // ==========================================================================

  function setupGlobalDelegation() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, [data-action]');
      if (!btn) return;
      const act = btn.dataset.action;

      if (btn.dataset.roleBtn) {
        setRole(btn.dataset.roleBtn);
        return;
      }

      if (act === 'close') {
        const m = btn.closest('[data-modal]');
        if (m) closeModal(m.id);
        return;
      }
      if (act === 'vote') {
        const id = btn.dataset.id;
        if (id) voteProblem(id);
        return;
      }
      if (act === 'focus') {
        const id = btn.dataset.id;
        if (id) focusOnMap(id);
        return;
      }
      if (act === 'evaluate') {
        const id = btn.dataset.id;
        if (id) openEvaluate(id);
        return;
      }
      if (act === 'reject') {
        const id = btn.dataset.id;
        if (id) openReject(id);
        return;
      }
      if (act === 'restore') {
        const id = btn.dataset.id;
        if (id) restoreProblem(id);
        return;
      }
      if (act === 'explain') {
        const id = btn.dataset.id;
        if (id) openExplain(id);
        return;
      }
      if (act === 'delete') {
        const id = btn.dataset.id;
        if (id) deleteProblem(id);
        return;
      }
      if (act === 'photo') {
        const id = btn.dataset.id;
        const idx = btn.dataset.index;
        if (id) openLightbox(id, idx);
        return;
      }
      if (act === 'remove-photo') {
        const idx = parseInt(btn.dataset.index, 10);
        if (Number.isFinite(idx)) {
          rt.pendingPhotos.splice(idx, 1);
          renderPhotoPreviews();
        }
        return;
      }
      if (act === 'preset') {
        const pid = btn.dataset.preset;
        if (pid) applyPreset(pid);
        return;
      }
      if (act === 'preset-move') {
        const pid = btn.dataset.preset;
        const dir = parseInt(btn.dataset.dir, 10);
        if (pid && dir) movePreset(pid, dir);
        return;
      }
      if (act === 'preset-delete') {
        const pid = btn.dataset.preset;
        if (pid) deletePreset(pid);
        return;
      }
      if (act === 'token') {
        const tok = btn.dataset.token;
        if (tok) insertToken(tok);
        return;
      }
      if (act === 'cat-del') {
        const ci = parseInt(btn.dataset.ci, 10);
        if (Number.isFinite(ci)) deleteCategory(ci);
        return;
      }
      if (act === 'title-del') {
        const ci = parseInt(btn.dataset.ci, 10);
        const ti = parseInt(btn.dataset.ti, 10);
        if (Number.isFinite(ci) && Number.isFinite(ti)) deleteTitle(ci, ti);
        return;
      }
      if (act === 'cat-add-title') {
        const ci = parseInt(btn.dataset.ci, 10);
        if (Number.isFinite(ci)) addTitle(ci);
        return;
      }
    });

    // Закрытие модалок по клику на фон
    $$('[data-modal]').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m.id);
      });
    });

    // Закрытие по Escape и навигация лайтбокса
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeTopModal();
      } else if (!document.getElementById('modalLightbox').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') nextLightbox(-1);
        if (e.key === 'ArrowRight') nextLightbox(1);
      }
    });
  }

  function bindDomEvents() {
    // Шапка и глобальные кнопки
    $('#btnAbout').addEventListener('click', toggleAboutPanel);
    $('#btnAboutClose').addEventListener('click', toggleAboutPanel);
    $('#btnExport').addEventListener('click', exportJson);
    $('#btnImport').addEventListener('click', triggerImport);
    $('#fileImport').addEventListener('change', onImportFile);
    $('#btnReset').addEventListener('click', resetToPresets);

    // Карта и фильтры
    $('#mapFilterCategory').addEventListener('change', (e) => {
      state.categoryFilter = e.target.value;
      saveSoon();
      renderMapData();
      renderActiveRole();
    });
    $('#mapFilterStatus').addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      saveSoon();
      renderMapData();
      renderActiveRole();
    });

    // Форма горожанина
    $('#fCategory').addEventListener('change', renderTitleSelect);
    $('#fTitle').addEventListener('change', renderNearbyHint);
    $('#citizenForm').addEventListener('submit', submitCitizenProblem);
    $('#fPhotos').addEventListener('change', (e) => handlePhotoFiles(e.target.files));
    $('#citizenSort').addEventListener('change', (e) => {
      state.citizenSort = e.target.value;
      saveSoon();
      renderCitizenList();
    });

    // Геолокация
    $('#btnGeolocate').addEventListener('click', () => {
      if (navigator.geolocation) {
        toast('Определение геопозиции...', 'info', 2000);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = [E.round6(pos.coords.longitude), E.round6(pos.coords.latitude)];
            if (inCity(c)) {
              setPickCoords(c);
              if (rt.map) rt.map.flyTo({ center: c, zoom: 15 });
            } else {
              toast(`Ваши координаты (${coordsText(c)}) находятся вне г. Экибастуз. Выберите точку кликом по карте.`, 'warn', 5000);
            }
          },
          (err) => {
            toast('Не удалось получить координаты устройства. Кликните по карте.', 'warn');
          },
          { timeout: 7000 }
        );
      } else {
        toast('Геолокация не поддерживается вашим браузером. Кликните по карте.', 'warn');
      }
    });

    // Оценщик: кластеризация
    const syncClusterR = (val) => {
      state.clusterRadiusMeters = clamp(parseInt(val, 10) || 0, 0, 500);
      $('#clusterRadius').value = state.clusterRadiusMeters;
      $('#clusterRadiusNum').value = state.clusterRadiusMeters;
      saveSoon();
      renderClusterPreview();
      renderNearbyHint();
    };
    $('#clusterRadius').addEventListener('input', (e) => syncClusterR(e.target.value));
    $('#clusterRadiusNum').addEventListener('input', (e) => syncClusterR(e.target.value));
    $('#btnMerge').addEventListener('click', runClusterMerge);
    $('#btnUnmerge').addEventListener('click', runClusterUnmerge);

    // Модалка экспертизы: слайдеры
    const bindEvSlider = (id, valId) => {
      $('#' + id).addEventListener('input', (e) => {
        $('#' + valId).textContent = e.target.value;
      });
    };
    bindEvSlider('evSeverity', 'evSeverityVal');
    bindEvSlider('evUrgency', 'evUrgencyVal');
    bindEvSlider('evFeasibility', 'evFeasibilityVal');
    $('#evGis').addEventListener('click', applyGisEstimate);
    $('#evSubmit').addEventListener('click', submitEvaluation);
    $('#rjSubmit').addEventListener('click', submitReject);

    // Лайтбокс: стрелки
    $('#lbPrev').addEventListener('click', () => nextLightbox(-1));
    $('#lbNext').addEventListener('click', () => nextLightbox(1));

    // Админ: Калькулятор формул
    $('#formulaInput').addEventListener('input', debounce(onFormulaInput, 150));
    $('#weightSliders').addEventListener('input', onWeightInput);
    $('#btnNormalizeWeights').addEventListener('click', normalizeWeightsToOne);
    $('#btnResetWeights').addEventListener('click', resetWeightsDefault);
    $('#btnNewPreset').addEventListener('click', () => openAddPresetModal(false));
    $('#btnSaveAsPreset').addEventListener('click', () => openAddPresetModal(true));
    $('#formNewPreset').addEventListener('submit', submitAddPreset);

    // Бюджет
    $('#budgetRange').addEventListener('input', (e) => setBudgetLimit(e.target.value));
    $$('input[name="budgetStrategy"]').forEach((r) => {
      r.addEventListener('change', (e) => setBudgetStrategy(e.target.value));
    });
    $('#btnBaseline').addEventListener('click', captureBaselineSlotA);
    $('#btnClearBaseline').addEventListener('click', clearBaselineSlot);

    // Таблица рейтинга
    $('#rankingBody').addEventListener('input', debounce(onTableInlineEdit, 250));
    $('#btnQuickAdd').addEventListener('click', quickAddTestProblem);

    // Справочник
    $('#btnAddCategory').addEventListener('click', addCategory);
  }

  // ==========================================================================
  // 19. СТАРТ ПРИЛОЖЕНИЯ
  // ==========================================================================
  function initApp() {
    state = loadState();

    // Первоначальная компиляция формулы
    applyFormulaText(state.customFormula || (getPresets()[0] ? getPresets()[0].formula : D.FORMULA_PRESETS[0].formula));
    $('#formulaInput').value = state.customFormula;

    // Первоначальный расчёт модели
    recompute();

    // Генерация статических элементов управления
    buildPresetButtons();
    buildVariableButtons();
    buildWeightSliders();
    renderFactorLegend();

    // Привязка слушателей
    setupGlobalDelegation();
    bindDomEvents();

    // Рендер справочника, фильтров и форм
    renderAll();

    // Инициализация карты MapLibre GL
    initMap();

    // Установка активной роли
    setRole(state.activeRole || 'admin');

    // Отрисовка Lucide иконок
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
