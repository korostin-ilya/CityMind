/**
 * CityMind — Математическое ядро СППР (г. Экибастуз)
 * ---------------------------------------------------------------------------
 *  • Геодезия: формула Гаверсинуса, центроиды, окружности для карты
 *  • Пространственная кластеризация Disjoint Complete-Linkage (без дублей окружностей)
 *  • Компиляция пользовательских формул (Math.js) + рендер в LaTeX (KaTeX)
 *  • Ранжирование + Explainable AI (Marginal Ablation — пофакторное исключение)
 *  • Эталонный метод TOPSIS, ранговая корреляция Спирмена
 *  • Распределение бюджета (строго по рейтингу / Greedy Portfolio Fill)
 *  • ГИС-оценка охвата населения по плотности застройки
 *
 * Работает без сборки и ES-модулей (classic <script>), совместим с file://.
 * Экспорт: window.CityMind.Math
 * ВАЖНО: глобальный объект библиотеки Math.js (window.math) не переопределяется.
 */
(function (global) {
  'use strict';

  const CM = (global.CityMind = global.CityMind || {});

  // ==========================================================================
  // 0. СЛОВАРЬ ФАКТОРОВ МОДЕЛИ
  // ==========================================================================
  const FACTORS = ['severity', 'urgency', 'population', 'cost', 'feasibility', 'votes'];

  /** true — критерий-выгода (больше = лучше), false — критерий-затраты (меньше = лучше) */
  const BENEFIT = {
    severity: true, urgency: true, population: true,
    cost: false, feasibility: true, votes: true
  };

  const FACTOR_META = {
    severity:    { key: 'severity',    letter: 'S', weight: 'wS', label: 'Серьёзность',          short: 'S', color: '#e11d48', unit: '/10' },
    urgency:     { key: 'urgency',     letter: 'U', weight: 'wU', label: 'Срочность',            short: 'U', color: '#f97316', unit: '/10' },
    population:  { key: 'population',  letter: 'P', weight: 'wP', label: 'Охват жителей',        short: 'P', color: '#4f46e5', unit: 'чел.' },
    cost:        { key: 'cost',        letter: 'C', weight: 'wC', label: 'Стоимость',            short: 'C', color: '#14b8a6', unit: 'млн ₸' },
    feasibility: { key: 'feasibility', letter: 'F', weight: 'wF', label: 'Лёгкость реализации',  short: 'F', color: '#0ea5e9', unit: '/10' },
    votes:       { key: 'votes',       letter: 'V', weight: 'wV', label: 'Голоса жителей',       short: 'V', color: '#a855f7', unit: 'гол.' }
  };

  /** Нижняя граница мин-макс нормализации (защита от деления на ноль и log(0)) */
  const NORM_EPS = 0.01;

  // ==========================================================================
  // 1. ГЕОДЕЗИЯ
  // ==========================================================================
  const EARTH_RADIUS_M = 6371008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const round6 = (x) => Math.round(x * 1e6) / 1e6;

  /** Расстояние по формуле Гаверсинуса (метры). a, b — [lng, lat] */
  function haversine(a, b) {
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /** Геометрический центр множества точек [lng, lat] */
  function centroid(points) {
    if (!points || !points.length) return [0, 0];
    let x = 0, y = 0;
    for (const p of points) { x += p[0]; y += p[1]; }
    return [x / points.length, y / points.length];
  }

  /** Максимальное расстояние от центра до точек множества (м) */
  function maxDistanceFrom(center, points) {
    let m = 0;
    for (const p of points) m = Math.max(m, haversine(center, p));
    return m;
  }

  /** Диаметр множества — расстояние между двумя самыми отдалёнными точками (м) */
  function diameter(points) {
    let m = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        m = Math.max(m, haversine(points[i], points[j]));
      }
    }
    return m;
  }

  /** Полигон-окружность заданного радиуса (м) для GeoJSON-слоя карты */
  function circlePolygon(center, radiusMeters, steps) {
    const n = steps || 64;
    const latR = radiusMeters / 111320;
    const lngR = radiusMeters / (111320 * Math.cos(toRad(center[1])));
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push([center[0] + lngR * Math.cos(a), center[1] + latR * Math.sin(a)]);
    }
    return ring;
  }

  // ==========================================================================
  // 2. КЛАСТЕРИЗАЦИЯ DISJOINT COMPLETE-LINKAGE (Раздел 6 спецификации)
  // ==========================================================================
  function pointsOf(p) {
    if (Array.isArray(p.sourcePoints) && p.sourcePoints.length) {
      return p.sourcePoints.map((pt) => [Number(pt[0]), Number(pt[1])]);
    }
    return [[Number(p.coords[0]), Number(p.coords[1])]];
  }

  function detailsOf(p) {
    if ((p.mergedCount || 1) > 1 && Array.isArray(p.sourceDetails) && p.sourceDetails.length) {
      return p.sourceDetails.slice();
    }
    return [p.details || (Array.isArray(p.sourceDetails) && p.sourceDetails[0]) || ''];
  }

  /** Исходные (неслитые) заявки кластера — для операции «Разъединить» */
  function originalsOf(p) {
    if (Array.isArray(p.mergedFrom) && p.mergedFrom.length) return p.mergedFrom.slice();
    const copy = Object.assign({}, p);
    delete copy.mergedFrom;
    return [copy];
  }

  /**
   * Условие вхождения объединённого множества в окружность радиуса R:
   *  1) расстояние от нового центра до КАЖДОЙ точки ≤ R;
   *  2) расстояние между двумя самыми отдалёнными точками ≤ 2R.
   */
  function canMerge(points, R) {
    if (!(R > 0)) return false;
    const c = centroid(points);
    for (const p of points) if (haversine(c, p) > R + 1e-6) return false;
    return diameter(points) <= 2 * R + 1e-6;
  }

  /** Слияние двух кластеров по правилам агрегации полей (п. 6.5) */
  function mergeTwo(c1, c2) {
    // «Ведущий» кластер (id сохраняется) — с бóльшим числом голосов
    const [a, b] = (Number(c2.votes) || 0) > (Number(c1.votes) || 0) ? [c2, c1] : [c1, c2];
    const points = pointsOf(a).concat(pointsOf(b));
    const center = centroid(points);
    const details = detailsOf(a).concat(detailsOf(b));
    const photos = Array.from(new Set([...(a.photos || []), ...(b.photos || [])]));

    return Object.assign({}, a, {
      coords: [round6(center[0]), round6(center[1])],
      votes: (Number(a.votes) || 0) + (Number(b.votes) || 0),
      photos,
      details: details.map((d, i) => `[Заявка #${i + 1}]: ${d}`).join(' | '),
      sourceDetails: details,
      sourcePoints: points.map((p) => [round6(p[0]), round6(p[1])]),
      mergedCount: (a.mergedCount || 1) + (b.mergedCount || 1),
      clusterRadius: Math.round(maxDistanceFrom(center, points)),
      severity: Math.max(Number(a.severity) || 0, Number(b.severity) || 0),
      urgency: Math.max(Number(a.urgency) || 0, Number(b.urgency) || 0),
      feasibility: Math.min(Number(a.feasibility) || 0, Number(b.feasibility) || 0),
      population: Math.max(Number(a.population) || 0, Number(b.population) || 0),
      cost: +(((Number(a.cost) || 0) + (Number(b.cost) || 0)) * 0.85).toFixed(1),
      createdAt: [a.createdAt, b.createdAt].filter(Boolean).sort()[0] || a.createdAt,
      mergedFrom: originalsOf(a).concat(originalsOf(b))
    });
  }

  /**
   * Иерархическая кластеризация полной связи.
   * Объединяются только кластеры с одинаковыми title И status (pending/evaluated).
   * На каждом шаге берётся ближайшая (по центрам) пара, удовлетворяющая условию R.
   * @returns {{problems: Array, merges: number, groups: Array, involved: number}}
   */
  function clusterProblems(problems, R) {
    const isActive = (p) => p.status === 'pending' || p.status === 'evaluated';
    const others = problems.filter((p) => !isActive(p));
    let clusters = problems.filter(isActive).map((p) => ({ item: p, members: [p.id] }));
    let merges = 0;

    if (R > 0) {
      for (;;) {
        const pairs = [];
        for (let i = 0; i < clusters.length; i++) {
          for (let j = i + 1; j < clusters.length; j++) {
            const A = clusters[i].item, B = clusters[j].item;
            if (A.title !== B.title || A.status !== B.status) continue;
            const d = haversine(A.coords, B.coords);
            if (d <= 2 * R) pairs.push({ i, j, d });
          }
        }
        pairs.sort((x, y) => x.d - y.d);

        let mergedPair = null;
        for (const pr of pairs) {
          const pts = pointsOf(clusters[pr.i].item).concat(pointsOf(clusters[pr.j].item));
          if (canMerge(pts, R)) { mergedPair = pr; break; }
        }
        if (!mergedPair) break;

        const { i, j } = mergedPair;
        const merged = {
          item: mergeTwo(clusters[i].item, clusters[j].item),
          members: clusters[i].members.concat(clusters[j].members)
        };
        clusters = clusters.filter((_, k) => k !== i && k !== j);
        clusters.splice(i, 0, merged);
        merges++;
      }
    }

    const groups = clusters
      .filter((c) => c.members.length > 1)
      .map((c) => ({
        id: c.item.id,
        title: c.item.title,
        status: c.item.status,
        count: c.members.length,
        ids: c.members.slice(),
        center: c.item.coords.slice(),
        radius: c.item.clusterRadius
      }));

    return {
      problems: clusters.map((c) => c.item).concat(others),
      merges,
      groups,
      involved: groups.reduce((s, g) => s + g.count, 0)
    };
  }

  /** «Разъединить / Сбросить кластеризацию»: восстанавливает исходные заявки слитых кластеров */
  function unclusterProblems(problems) {
    const out = [];
    let split = 0;
    for (const p of problems) {
      if (Array.isArray(p.mergedFrom) && p.mergedFrom.length > 1) {
        const parts = JSON.parse(JSON.stringify(p.mergedFrom));
        // Голоса, набранные кластером уже после слияния, не теряются
        const delta = (Number(p.votes) || 0) - parts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
        if (delta > 0) parts[0].votes = (Number(parts[0].votes) || 0) + delta;
        parts.forEach((o) => {
          o.status = p.status;
          o.rejectReason = p.rejectReason || '';
        });
        out.push(...parts);
        split++;
      } else {
        out.push(p);
      }
    }
    return { problems: out, split };
  }

  // ==========================================================================
  // 3. СТАТИСТИКИ И SCOPE ДЛЯ ВЫЧИСЛИТЕЛЯ MATH.JS (Раздел 5.1)
  // ==========================================================================
  function rawValue(item, f) {
    let v = Number(item[f]);
    if (!Number.isFinite(v)) v = 0;
    if (f === 'cost') v = Math.max(0.01, v);
    else v = Math.max(0, v);
    return v;
  }

  function rawOf(item) {
    const r = {};
    for (const f of FACTORS) r[f] = rawValue(item, f);
    return r;
  }

  function computeStats(items) {
    const st = { n: items.length, total: {}, min: {}, max: {} };
    for (const f of FACTORS) {
      const vals = items.map((it) => rawValue(it, f));
      st.total[f] = vals.reduce((s, v) => s + v, 0);
      st.min[f] = vals.length ? Math.min(...vals) : 0;
      st.max[f] = vals.length ? Math.max(...vals) : 0;
    }
    return st;
  }

  function minMax(v, min, max) {
    if (!(max - min > 1e-12)) return 1;
    const t = (v - min) / (max - min);
    return Math.min(1, Math.max(NORM_EPS, NORM_EPS + (1 - NORM_EPS) * t));
  }

  /**
   * Формирует scope для одной проблемы: 4 группы переменных + короткие алиасы.
   * @param raw     сырые значения 6 факторов (могут быть подменены при абляции)
   * @param stats   статистики выборки (суммы, минимумы, максимумы)
   * @param weights веса wS..wV
   */
  function buildScope(raw, stats, weights) {
    const s = {};
    for (const f of FACTORS) {
      const L = FACTOR_META[f].letter;
      const cur = raw[f];
      const tot = stats.total[f];
      const rel = tot > 0 ? cur / tot : 0;
      // Группа 1: текущие и суммарные
      s[f + '_current'] = cur; s[L + '_cur'] = cur;
      s[f + '_total'] = tot;   s[L + '_tot'] = tot;
      // Группа 2: относительные доли
      s[f + '_rel'] = rel;     s[L + '_rel'] = rel;
      // Группа 3: мин-макс нормализация [0.01 .. 1.00]
      s[L] = minMax(cur, stats.min[f], stats.max[f]);
    }
    // Экономичность: 1.0 — самая дешёвая, 0.01 — самая дорогая
    s.C_inv = (stats.max.cost - stats.min.cost > 1e-12)
      ? Math.min(1, Math.max(NORM_EPS, 1 + NORM_EPS - s.C))
      : 1;
    s.problems_count = stats.n;
    s.N = stats.n;
    // Группа 4: весовые коэффициенты
    const w = weights || {};
    for (const f of FACTORS) {
      const k = FACTOR_META[f].weight;
      const v = Number(w[k]);
      s[k] = Number.isFinite(v) ? v : 0;
    }
    return s;
  }

  /** Тестовый scope для проверки формулы, когда оценённых проблем ещё нет */
  function probeScope(weights) {
    const fake = [
      { severity: 8, urgency: 7, population: 9000, cost: 30, feasibility: 7, votes: 200 },
      { severity: 5, urgency: 4, population: 2500, cost: 12, feasibility: 9, votes: 60 }
    ];
    return buildScope(rawOf(fake[0]), computeStats(fake), weights || {
      wS: 0.25, wU: 0.25, wP: 0.2, wC: 0.1, wF: 0.1, wV: 0.1
    });
  }

  // ==========================================================================
  // 4. КОМПИЛЯЦИЯ ФОРМУЛ (Math.js) И LaTeX (KaTeX)
  // ==========================================================================
  function translateError(msg) {
    const m = String(msg || '');
    let r;
    if ((r = m.match(/Undefined symbol\s+(\S+)/i))) return `Неизвестная переменная «${r[1]}». Используйте кнопки переменных под редактором.`;
    if ((r = m.match(/Undefined function\s+(\S+)/i))) return `Неизвестная функция «${r[1]}».`;
    if ((r = m.match(/Parenthesis \) expected \(char (\d+)\)/i))) return `Незакрытая скобка: ожидается «)» (символ ${r[1]}).`;
    if (/Unexpected end of expression/i.test(m)) return 'Незавершённое выражение: формула обрывается на операторе или скобке.';
    if ((r = m.match(/Value expected \(char (\d+)\)/i))) return `Ожидается число или переменная (символ ${r[1]}).`;
    if ((r = m.match(/Unexpected operator (\S+) \(char (\d+)\)/i))) return `Неожиданный оператор «${r[1]}» (символ ${r[2]}).`;
    if ((r = m.match(/Unexpected type of argument/i))) return 'Неверный тип аргумента функции.';
    if ((r = m.match(/Too few arguments|Too many arguments/i))) return 'Неверное число аргументов функции.';
    if ((r = m.match(/False part of conditional expression expected/i))) return 'Тернарный оператор неполный: после «?» ожидается часть «: значение».';
    return 'Ошибка парсера: ' + m;
  }

  function toNumber(res) {
    if (typeof res === 'number') return res;
    if (typeof res === 'boolean') return res ? 1 : 0;
    if (res && typeof res === 'object') {
      if (typeof res.re === 'number' && typeof res.im === 'number') {
        return Math.abs(res.im) < 1e-9 ? res.re : NaN;
      }
      if (typeof res.toNumber === 'function' && !res.units) {
        try { return res.toNumber(); } catch (e) { return NaN; }
      }
    }
    return NaN;
  }

  function isNonNumericObject(res) {
    if (res === null || res === undefined) return true;
    if (typeof res === 'number' || typeof res === 'boolean') return false;
    if (typeof res === 'object' && typeof res.re === 'number') return false;
    return true;
  }

  /**
   * Компилирует формулу. Не бросает исключений.
   * @returns {{ok:boolean, error?:string, node?:object, compiled?:object, text?:string}}
   */
  function compileFormula(expr, weights) {
    if (typeof global.math === 'undefined' || !global.math.parse) {
      return { ok: false, error: 'Библиотека Math.js не загружена (проверьте подключение к интернету для CDN).' };
    }
    const text = String(expr || '').trim();
    if (!text) return { ok: false, error: 'Формула пуста — выберите пресет или наберите выражение.' };
    try {
      const node = global.math.parse(text);
      const compiled = node.compile();
      const probe = compiled.evaluate(probeScope(weights));
      if (isNonNumericObject(probe)) {
        return { ok: false, error: 'Результат формулы не является числом — проверьте имена переменных (возможно, опечатка).' };
      }
      return { ok: true, node, compiled, text };
    } catch (e) {
      return { ok: false, error: translateError(e && e.message) };
    }
  }

  const TEX_LETTER = { votes: 'V', population: 'P', cost: 'C', severity: 'S', urgency: 'U', feasibility: 'F' };
  const SHORT_KIND = { cur: 'current', tot: 'total', rel: 'rel' };

  function texKind(L, kind) {
    if (kind === 'current') return `${L}_{i}`;
    if (kind === 'total') return `\\Sigma ${L}`;
    return `\\tfrac{${L}_{i}}{\\Sigma ${L}}`;
  }

  function symbolTex(name) {
    let m;
    if ((m = name.match(/^(votes|population|cost|severity|urgency|feasibility)_(current|total|rel)$/))) {
      return texKind(TEX_LETTER[m[1]], m[2]);
    }
    if ((m = name.match(/^([VPCSUF])_(cur|tot|rel)$/))) return texKind(m[1], SHORT_KIND[m[2]]);
    if (/^w[SUPCFV]$/.test(name)) return `w_{${name[1]}}`;
    if (/^[SUPCFV]$/.test(name)) return `\\hat{${name}}`;
    if (name === 'C_inv') return '\\hat{C}_{\\mathrm{inv}}';
    if (name === 'problems_count' || name === 'N') return 'N';
    return null;
  }

  /** LaTeX-представление формулы (для KaTeX) с красивыми обозначениями переменных */
  function toLatex(nodeOrText) {
    try {
      const node = typeof nodeOrText === 'string' ? global.math.parse(nodeOrText) : nodeOrText;
      const tex = node.toTex({
        parenthesis: 'keep',
        implicit: 'hide',
        handler: function (n) {
          if (n && n.type === 'SymbolNode') {
            const t = symbolTex(n.name);
            if (t) return t;
          }
          return undefined;
        }
      });
      return 'Y_{i} = ' + tex;
    } catch (e) {
      return null;
    }
  }

  // ==========================================================================
  // 5. РАНЖИРОВАНИЕ + EXPLAINABLE AI (Marginal Ablation, Раздел 5.3)
  // ==========================================================================
  /**
   * @param items    проблемы со статусом evaluated
   * @param compiled скомпилированная формула Math.js
   * @param weights  веса
   * @returns {{rows: Array, stats: object}} rows отсортированы по убыванию балла
   * @throws Error если формула даёт нечисловой результат
   */
  function computeRanking(items, compiled, weights) {
    const stats = computeStats(items);
    const evalRaw = (raw) => toNumber(compiled.evaluate(buildScope(raw, stats, weights)));

    const rows = items.map((it) => {
      const raw = rawOf(it);
      const Y = evalRaw(raw);
      if (!Number.isFinite(Y)) {
        const t = String(it.title || it.id);
        throw new Error(`Формула дала нечисловой результат (${Y}) для проблемы «${t.length > 50 ? t.slice(0, 50) + '…' : t}». Возможно деление на ноль.`);
      }
      const deltas = {};
      let sum = 0;
      for (const f of FACTORS) {
        // Подмена фактора наихудшим значением по выборке
        const worst = BENEFIT[f] ? stats.min[f] : stats.max[f];
        const y2 = evalRaw(Object.assign({}, raw, { [f]: worst }));
        const d = Number.isFinite(y2) ? Math.abs(Y - y2) : 0;
        deltas[f] = d;
        sum += d;
      }
      const contributions = {};
      for (const f of FACTORS) contributions[f] = sum > 0 ? (deltas[f] / sum) * 100 : 0;
      return { id: it.id, item: it, raw: Y, deltas, deltaSum: sum, contributions, score: 0, rank: 0 };
    });

    // Масштабирование к [0..100], где 100 — лидер рейтинга
    if (rows.length) {
      const ys = rows.map((r) => r.raw);
      const maxY = Math.max(...ys), minY = Math.min(...ys);
      rows.forEach((r) => {
        if (minY >= 0) r.score = maxY > 0 ? (r.raw / maxY) * 100 : 0;
        else r.score = maxY - minY > 1e-12 ? ((r.raw - minY) / (maxY - minY)) * 100 : 100;
      });
    }

    rows.sort((a, b) => (b.raw - a.raw) || String(a.id).localeCompare(String(b.id)));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { rows, stats };
  }

  // ==========================================================================
  // 6. ЭТАЛОННЫЙ TOPSIS И СПИРМЕН (Раздел 5.4)
  // ==========================================================================
  function normalizedWeights(weights) {
    const w = {};
    let sum = 0;
    for (const f of FACTORS) {
      const v = Math.max(0, Number((weights || {})[FACTOR_META[f].weight]) || 0);
      w[f] = v; sum += v;
    }
    for (const f of FACTORS) w[f] = sum > 0 ? w[f] / sum : 1 / FACTORS.length;
    return w;
  }

  /**
   * TOPSIS: векторная нормализация → взвешивание → расстояния до A+ и A− → C* = D−/(D+ + D−)
   * @returns {{rows: Array, byId: Object, ranks: Object}}
   */
  function topsis(items, weights) {
    const out = { rows: [], byId: {}, ranks: {} };
    if (!items.length) return out;
    const w = normalizedWeights(weights);
    const norms = {};
    for (const f of FACTORS) {
      norms[f] = Math.sqrt(items.reduce((s, it) => s + rawValue(it, f) ** 2, 0));
    }
    const V = items.map((it) => {
      const v = {};
      for (const f of FACTORS) v[f] = norms[f] > 0 ? (rawValue(it, f) / norms[f]) * w[f] : 0;
      return v;
    });
    const ideal = {}, anti = {};
    for (const f of FACTORS) {
      const col = V.map((v) => v[f]);
      const mx = Math.max(...col), mn = Math.min(...col);
      ideal[f] = BENEFIT[f] ? mx : mn;
      anti[f] = BENEFIT[f] ? mn : mx;
    }
    const rows = items.map((it, i) => {
      let dp = 0, dm = 0;
      for (const f of FACTORS) {
        dp += (V[i][f] - ideal[f]) ** 2;
        dm += (V[i][f] - anti[f]) ** 2;
      }
      dp = Math.sqrt(dp); dm = Math.sqrt(dm);
      const closeness = dp + dm > 1e-12 ? dm / (dp + dm) : 0.5;
      return { id: it.id, item: it, dPlus: dp, dMinus: dm, closeness, score: 0, rank: 0 };
    });
    const maxC = Math.max(...rows.map((r) => r.closeness));
    rows.forEach((r) => { r.score = maxC > 0 ? (r.closeness / maxC) * 100 : 0; });
    rows.sort((a, b) => (b.closeness - a.closeness) || String(a.id).localeCompare(String(b.id)));
    rows.forEach((r, i) => {
      r.rank = i + 1;
      out.byId[r.id] = r;
      out.ranks[r.id] = r.rank;
    });
    out.rows = rows;
    return out;
  }

  /** Карта id → ранг */
  function ranksMap(rows) {
    const m = {};
    (rows || []).forEach((r) => { m[r.id] = r.rank; });
    return m;
  }

  /**
   * Коэффициент ранговой корреляции Спирмена ρ = 1 − 6Σd² / (n(n² − 1)).
   * Считается по пересечению множеств id; ранги пересчитываются внутри пересечения.
   * @returns {number|null}
   */
  function spearman(ranksA, ranksB) {
    if (!ranksA || !ranksB) return null;
    const ids = Object.keys(ranksA).filter((id) => Object.prototype.hasOwnProperty.call(ranksB, id));
    const n = ids.length;
    if (n < 2) return null;
    const rerank = (src) => {
      const sorted = ids.slice().sort((x, y) => (src[x] - src[y]) || x.localeCompare(y));
      const m = {};
      sorted.forEach((id, i) => { m[id] = i + 1; });
      return m;
    };
    const a = rerank(ranksA), b = rerank(ranksB);
    let sumD2 = 0;
    for (const id of ids) sumD2 += (a[id] - b[id]) ** 2;
    return 1 - (6 * sumD2) / (n * (n * n - 1));
  }

  // ==========================================================================
  // 7. РАСПРЕДЕЛЕНИЕ БЮДЖЕТА
  // ==========================================================================
  /**
   * @param rows     ранжированные строки (по убыванию балла)
   * @param budget   доступный бюджет, млн ₸
   * @param strategy 'sequential' — строго по рейтингу (стоп на первой непоместившейся);
   *                 'greedy_fill' — пропуск дорогой задачи и дозаполнение остатка более дешёвыми
   */
  function allocateBudget(rows, budget, strategy) {
    const limit = Math.max(0, Number(budget) || 0);
    let remaining = limit;
    let stopped = false;
    const funded = new Set();
    const details = {};
    const byCategory = {};

    for (const r of rows) {
      const cost = rawValue(r.item, 'cost');
      const cat = r.item.category || 'Без категории';
      if (!byCategory[cat]) byCategory[cat] = { funded: 0, deficit: 0, fundedCount: 0, count: 0 };
      byCategory[cat].count++;

      const before = remaining;
      if (!stopped && cost <= remaining + 1e-9) {
        funded.add(r.id);
        remaining -= cost;
        byCategory[cat].funded += cost;
        byCategory[cat].fundedCount++;
        details[r.id] = { funded: true, remainingBefore: before, reason: 'funded' };
      } else {
        byCategory[cat].deficit += cost;
        details[r.id] = { funded: false, remainingBefore: before, reason: stopped ? 'stopped' : 'insufficient' };
        if (strategy !== 'greedy_fill') stopped = true;
      }
    }

    const spent = limit - remaining;
    const deficit = rows.reduce((s, r) => s + (funded.has(r.id) ? 0 : rawValue(r.item, 'cost')), 0);
    return {
      budget: limit, spent, remaining, deficit,
      utilization: limit > 0 ? spent / limit : 0,
      funded, details, byCategory, strategy
    };
  }

  // ==========================================================================
  // 8. ГИС-ОЦЕНКА ОХВАТА НАСЕЛЕНИЯ ПО ПЛОТНОСТИ ЗАСТРОЙКИ
  // ==========================================================================
  /** Упрощённая модель плотности г. Экибастуз: ядра многоэтажной застройки (гауссовы) */
  const DENSITY_HUBS = [
    { c: [75.3255, 51.7290], amp: 15000, s: 900, name: 'центральная часть города' },
    { c: [75.3190, 51.7240], amp: 14000, s: 520, name: 'мкр. 8 (плотная 5–9-этажная застройка)' },
    { c: [75.3410, 51.7215], amp: 12500, s: 560, name: 'мкр. 19 / 22' },
    { c: [75.3120, 51.7195], amp: 9000,  s: 460, name: 'мкр. 6' },
    { c: [75.3485, 51.7262], amp: 8500,  s: 500, name: 'мкр. 17' },
    { c: [75.3300, 51.7365], amp: 7500,  s: 620, name: 'северный жилой район' },
    { c: [75.3110, 51.7330], amp: 6000,  s: 480, name: 'западный жилой район' }
  ];

  function estimatePopulation(coords) {
    let pop = 1200; // фон: частный сектор и промзоны
    let best = null, bestVal = 0;
    for (const h of DENSITY_HUBS) {
      const d = haversine(coords, h.c);
      const v = h.amp * Math.exp(-((d / h.s) ** 2));
      pop += v;
      if (v > bestVal) { bestVal = v; best = h; }
    }
    // Детерминированная поправка ±6% (микроструктура кварталов)
    const hash = Math.sin(coords[0] * 12.9898 + coords[1] * 78.233) * 43758.5453;
    const jitter = 1 + ((hash - Math.floor(hash)) - 0.5) * 0.12;
    pop = Math.round((pop * jitter) / 100) * 100;
    pop = Math.max(500, Math.min(40000, pop));
    let density;
    if (pop >= 12000) density = 'плотная многоэтажная застройка';
    else if (pop >= 6000) density = 'среднеэтажная жилая застройка';
    else if (pop >= 2500) density = 'смешанная застройка';
    else density = 'малоэтажная застройка / частный сектор';
    return { population: pop, density, zone: best ? best.name : 'окраина города' };
  }

  // ==========================================================================
  // ЭКСПОРТ
  // ==========================================================================
  CM.Math = {
    FACTORS, BENEFIT, FACTOR_META, NORM_EPS,
    // геодезия
    haversine, centroid, diameter, maxDistanceFrom, circlePolygon, round6,
    // кластеризация
    canMerge, mergeTwo, clusterProblems, unclusterProblems,
    // модель
    rawValue, rawOf, computeStats, buildScope, minMax,
    compileFormula, translateError, toLatex, toNumber,
    computeRanking, topsis, ranksMap, spearman, normalizedWeights,
    allocateBudget, estimatePopulation
  };
})(window);
