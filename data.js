/**
 * CityMind — Модуль эталонных данных, классификатора и пресетов математических моделей (г. Экибастуз)
 * Работает без сборщиков и ES-модулей (совместимо с GitHub Pages и локальным запуском по file://)
 */

// ============================================================================
// 1. ПРЕДОПРЕДЕЛЁННЫЙ КЛАССИФИКАТОР ПРОБЛЕМ (Управляется Администратором)
// ============================================================================
const DEFAULT_PROBLEM_CATALOG = {
  "ЖКХ и теплосети": [
    "Износ / порыв участка магистральной теплосети",
    "Нарушение теплоизоляции трубопровода / парение из камеры",
    "Аварийное состояние внутриквартального водопровода и канализации",
    "Необходимость балансировки и промывки квартального теплового узла"
  ],
  "Дороги и транспорт": [
    "Разрушение асфальтового покрытия проезжей части (ямочность)",
    "Отсутствие / засорение дождеприёмника ливневой канализации",
    "Неисправность светофорного объекта или отсутствие дорожных знаков",
    "Разрушение тротуара и пешеходных дорожек"
  ],
  "Освещение и электросети": [
    "Отсутствие уличного освещения на участке улицы / во дворе",
    "Аварийная опора ЛЭП / провисание СИП-кабеля",
    "Износ распределительного щита наружного освещения"
  ],
  "Благоустройство и экология": [
    "Аварийное состояние детской / спортивной площадки",
    "Несанкционированная свалка / нарушение графика вывоза ТБО",
    "Необходимость озеленения и ремонта поливочного водопровода",
    "Благоустройство сквера и замена малых архитектурных форм"
  ]
};

// ============================================================================
// 2. ГЕНЕРАТОР ВСТРОЕННЫХ SVG-ФОТОДОКАЗАТЕЛЬСТВ (Работает 100% офлайн)
// ============================================================================
function generatePresetPhotoSVG(category, codeLabel, locationLabel, coords, dateStr, badgeText) {
  const palettes = {
    "ЖКХ и теплосети": {
      bg1: "#1e293b", bg2: "#334155", accent: "#ef4444", secondary: "#f97316",
      iconName: "ТЕПЛОСЕТИ / ИНЖЕНЕРНЫЕ СЕТИ",
      graphic: `
        <!-- Трубопровод и парение -->
        <rect x="60" y="165" width="480" height="34" rx="6" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
        <rect x="140" y="158" width="28" height="48" rx="4" fill="#64748b"/>
        <rect x="420" y="158" width="28" height="48" rx="4" fill="#64748b"/>
        <!-- Зона повреждения -->
        <circle cx="295" cy="182" r="24" fill="#ef4444" fill-opacity="0.35" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3"/>
        <path d="M285 170 L305 194 M305 170 L285 194" stroke="#fca5a5" stroke-width="3"/>
        <!-- Клубы пара -->
        <path d="M275 145 Q260 115 285 95 Q300 75 280 55" fill="none" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
        <path d="M300 140 Q320 110 295 85 Q315 65 305 45" fill="none" stroke="#f8fafc" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
        <path d="M325 148 Q340 120 320 100" fill="none" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" opacity="0.65"/>
      `
    },
    "Дороги и транспорт": {
      bg1: "#18181b", bg2: "#27272a", accent: "#f59e0b", secondary: "#eab308",
      iconName: "ДОРОЖНОЕ ПОЛОТНО / ИНФРАСТРУКТУРА",
      graphic: `
        <!-- Перспектива дороги -->
        <polygon points="170,70 430,70 540,235 60,235" fill="#3f3f46" stroke="#71717a" stroke-width="2"/>
        <line x1="300" y1="75" x2="300" y2="230" stroke="#facc15" stroke-width="4" stroke-dasharray="18 14"/>
        <!-- Выбоина / дефект полотна -->
        <ellipse cx="255" cy="175" rx="52" ry="22" fill="#18181b" stroke="#f59e0b" stroke-width="2.5"/>
        <ellipse cx="258" cy="178" rx="38" ry="14" fill="#0ea5e9" fill-opacity="0.35"/>
        <!-- Дорожный конус -->
        <polygon points="355,135 338,190 372,190" fill="#f97316" stroke="#fff" stroke-width="1.5"/>
        <line x1="344" y1="168" x2="366" y2="168" stroke="#ffffff" stroke-width="5"/>
      `
    },
    "Освещение и электросети": {
      bg1: "#0f172a", bg2: "#1e1b4b", accent: "#38bdf8", secondary: "#818cf8",
      iconName: "НАРУЖНОЕ ОСВЕЩЕНИЕ / ЭЛЕКТРОСЕТИ",
      graphic: `
        <!-- Опора освещения -->
        <line x1="220" y1="230" x2="220" y2="75" stroke="#94a3b8" stroke-width="8"/>
        <path d="M220 80 Q265 60 315 72" fill="none" stroke="#94a3b8" stroke-width="6"/>
        <rect x="305" y="68" width="32" height="12" rx="4" fill="#e2e8f0"/>
        <!-- Провисающий кабель и искрение -->
        <path d="M90 95 Q155 155 220 95 Q285 160 470 105" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="6 3"/>
        <circle cx="320" cy="115" r="28" fill="#38bdf8" fill-opacity="0.18" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 4"/>
        <polygon points="322,92 310,115 324,115 314,138 336,110 321,110" fill="#facc15"/>
      `
    },
    "Благоустройство и экология": {
      bg1: "#064e3b", bg2: "#115e59", accent: "#10b981", secondary: "#34d399",
      iconName: "ГОРОДСКАЯ СРЕДА / БЛАГОУСТРОЙСТВО",
      graphic: `
        <!-- Деревья и парковая зона -->
        <rect x="70" y="195" width="460" height="32" rx="4" fill="#047857"/>
        <circle cx="155" cy="135" r="36" fill="#10b981" fill-opacity="0.7"/>
        <rect x="150" y="155" width="10" height="42" fill="#78350f"/>
        <!-- Скамья / площадка -->
        <rect x="255" y="162" width="110" height="10" rx="2" fill="#fcd34d"/>
        <rect x="255" y="176" width="110" height="8" rx="2" fill="#d97706"/>
        <rect x="268" y="184" width="8" height="16" fill="#475569"/>
        <rect x="344" y="184" width="8" height="16" fill="#475569"/>
        <!-- Маркер инспекции -->
        <circle cx="435" cy="145" r="24" fill="#f43f5e" fill-opacity="0.3" stroke="#fda4af" stroke-width="2"/>
        <text x="435" y="152" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="18" font-weight="bold">!</text>
      `
    }
  };

  const theme = palettes[category] || palettes["ЖКХ и теплосети"];
  const lat = coords[1].toFixed(4);
  const lng = coords[0].toFixed(4);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" width="600" height="340">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${theme.bg1}"/>
        <stop offset="100%" stop-color="${theme.bg2}"/>
      </linearGradient>
    </defs>
    <!-- Фон -->
    <rect width="600" height="340" fill="url(#bgGrad)"/>
    <!-- Координатная сетка ГИС -->
    <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1">
      <line x1="0" y1="60" x2="600" y2="60"/><line x1="0" y1="120" x2="600" y2="120"/>
      <line x1="0" y1="180" x2="600" y2="180"/><line x1="0" y1="240" x2="600" y2="240"/>
      <line x1="120" y1="0" x2="120" y2="340"/><line x1="240" y1="0" x2="240" y2="340"/>
      <line x1="360" y1="0" x2="360" y2="340"/><line x1="480" y1="0" x2="480" y2="340"/>
    </g>
    <!-- Верхняя плашка инспекции -->
    <rect x="16" y="14" width="350" height="28" rx="6" fill="#000000" fill-opacity="0.55"/>
    <circle cx="32" cy="28" r="5" fill="${theme.accent}"/>
    <text x="45" y="33" fill="#f8fafc" font-family="sans-serif" font-size="11" font-weight="bold">${theme.iconName}</text>
    <!-- Бейдж фотофиксации справа -->
    <rect x="420" y="14" width="164" height="28" rx="6" fill="${theme.accent}" fill-opacity="0.9"/>
    <text x="502" y="32" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold">${badgeText || "ФОТОФИКСАЦИЯ"}</text>
    <!-- Центральная векторная сцена объекта -->
    ${theme.graphic}
    <!-- Прицел фотофиксации -->
    <path d="M40 70 L40 55 L55 55 M560 70 L560 55 L545 55 M40 225 L40 240 L55 240 M560 225 L560 240 L545 240" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
    <!-- Нижний штамп верификации CityMind -->
    <rect x="0" y="256" width="600" height="84" fill="#090d16" fill-opacity="0.88"/>
    <line x1="0" y1="256" x2="600" y2="256" stroke="${theme.accent}" stroke-width="2"/>
    <text x="20" y="280" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">${codeLabel}: ${locationLabel}</text>
    <text x="20" y="302" fill="#94a3b8" font-family="monospace" font-size="12">GPS: ${lat}° N, ${lng}° E  |  г. Экибастуз  |  Дата: ${dateStr}</text>

  </svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg.trim());
}

// ============================================================================
// 3. СЛОВАРЬ ПЕРЕМЕННЫХ И ПРЕСЕТЫ ДЛЯ ИНТЕРАКТИВНОГО КАЛЬКУЛЯТОРА ФОРМУЛ
// ============================================================================
const FORMULA_VARIABLES = {
  // Группа 1: Текущие и суммарные показатели (для дробей вида votes_current / votes_total)
  currentAndTotal: [
    { token: "votes_current",      alias: "V_cur", label: "Голоса (тек.)",      desc: "Количество голосов жителей у текущей проблемы" },
    { token: "votes_total",        alias: "V_tot", label: "Голоса (сумма)",     desc: "Сумма всех голосов жителей по всем проблемам города" },
    { token: "population_current", alias: "P_cur", label: "Охват (тек.)",       desc: "Охват жителей у текущей проблемы (чел.)" },
    { token: "population_total",   alias: "P_tot", label: "Охват (сумма)",      desc: "Суммарный охват жителей по всем проблемам города" },
    { token: "cost_current",       alias: "C_cur", label: "Стоимость (тек.)",   desc: "Стоимость решения текущей проблемы (млн ₸)" },
    { token: "cost_total",         alias: "C_tot", label: "Стоимость (сумма)",  desc: "Суммарная стоимость решения всех проблем (млн ₸)" },
    { token: "severity_current",   alias: "S_cur", label: "Серьёзность (1-10)", desc: "Сырой балл технической серьёзности проблемы (1..10)" },
    { token: "severity_total",     alias: "S_tot", label: "Серьёзность (сумма)",desc: "Сумма баллов серьёзности всех проблем" },
    { token: "urgency_current",    alias: "U_cur", label: "Срочность (1-10)",   desc: "Сырой балл срочности / риска аварии (1..10)" },
    { token: "urgency_total",      alias: "U_tot", label: "Срочность (сумма)",  desc: "Сумма баллов срочности всех проблем" },
    { token: "feasibility_current",alias: "F_cur", label: "Лёгкость (1-10)",    desc: "Сырой балл технической лёгкости реализации (1..10)" },
    { token: "feasibility_total",  alias: "F_tot", label: "Лёгкость (сумма)",   desc: "Сумма баллов лёгкости реализации всех проблем" }
  ],

  // Группа 2: Быстрые относительные доли (current / total)
  relativeShares: [
    { token: "(votes_current / votes_total)",           shortToken: "votes_rel",      label: "Доля голосов (V_cur / V_tot)",      desc: "Удельный вес голосов проблемы в общем пуле города [0..1]" },
    { token: "(population_current / population_total)", shortToken: "population_rel", label: "Доля охвата (P_cur / P_tot)",       desc: "Удельный вес затронутых жителей от общего охвата [0..1]" },
    { token: "(cost_current / cost_total)",             shortToken: "cost_rel",       label: "Доля затрат (C_cur / C_tot)",       desc: "Доля стоимости задачи в общей смете всех проблем [0..1]" },
    { token: "(severity_current / severity_total)",     shortToken: "severity_rel",   label: "Доля серьёзности (S_cur / S_tot)",  desc: "Относительная серьёзность проблемы" },
    { token: "(urgency_current / urgency_total)",       shortToken: "urgency_rel",    label: "Доля срочности (U_cur / U_tot)",    desc: "Относительная срочность проблемы" },
    { token: "(feasibility_current / feasibility_total)",shortToken: "feasibility_rel",label: "Доля лёгкости (F_cur / F_tot)",    desc: "Относительная лёгкость реализации" }
  ],

  // Группа 3: Мин-Макс нормализованные переменные [0.01 .. 1.00]
  normalized: [
    { token: "S",     label: "S (Норм. серьёзность)",   desc: "Мин-макс нормализованная серьёзность [0.01 .. 1.00]" },
    { token: "U",     label: "U (Норм. срочность)",     desc: "Мин-макс нормализованная срочность [0.01 .. 1.00]" },
    { token: "P",     label: "P (Норм. охват)",         desc: "Мин-макс нормализованный охват жителей [0.01 .. 1.00]" },
    { token: "V",     label: "V (Норм. голоса)",        desc: "Мин-макс нормализованные голоса жителей [0.01 .. 1.00]" },
    { token: "F",     label: "F (Норм. лёгкость)",      desc: "Мин-макс нормализованная лёгкость решения [0.01 .. 1.00]" },
    { token: "C",     label: "C (Норм. стоимость)",     desc: "Нормализованная стоимость (1.0 — самая дорогая, 0.01 — самая дешёвая)" },
    { token: "C_inv", label: "C_inv (Экономичность)",   desc: "Инвертированная стоимость (1.0 — самая дешёвая, 0.01 — самая дорогая)" }
  ],

  // Группа 4: Весовые коэффициенты (ползунки)
  weights: [
    { token: "wS", label: "wS (Вес серьёзности)", defaultVal: 0.25 },
    { token: "wU", label: "wU (Вес срочности)",   defaultVal: 0.25 },
    { token: "wP", label: "wP (Вес охвата)",      defaultVal: 0.20 },
    { token: "wV", label: "wV (Вес голосов)",     defaultVal: 0.10 },
    { token: "wF", label: "wF (Вес лёгкости)",    defaultVal: 0.10 },
    { token: "wC", label: "wC (Вес стоимости)",   defaultVal: 0.10 }
  ],

  // Группа 5: Математические операторы для кнопок калькулятора
  operators: [
    { token: " + ", label: "+" },
    { token: " - ", label: "−" },
    { token: " * ", label: "×" },
    { token: " / ", label: "÷" },
    { token: "^2",  label: "x²" },
    { token: "sqrt()", label: "√x" },
    { token: "log(1 + )", label: "ln(1+x)" },
    { token: "( )", label: "( )" },
    { token: "(severity_current >= 9 ? 1.5 : 1.0) * ", label: "IF Авария (×1.5)" }
  ]
};

const FORMULA_PRESETS = [
  {
    id: "relative_share_model",
    name: "1. Долевая модель (Относительный вес в городе)",
    shortName: "Долевая (current / total)",
    description: "Оценивает долю охвата жителей и голосов конкретной проблемы относительно общегородской суммы с учётом технической критичности и доли затрат.",
    formula: "wS * (severity_current / 10) + wU * (urgency_current / 10) + wP * (population_current / population_total) * 3 + wV * (votes_current / votes_total) * 3 + wF * (feasibility_current / 10) - wC * (cost_current / cost_total) * 2"
  },
  {
    id: "wsm_classic",
    name: "2. Линейная взвешенная сумма (WSM)",
    shortName: "Линейная (WSM)",
    description: "Классическая аддитивная модель многокритериального анализа по нормализованным параметрам [0.01..1.0]. Прозрачный эталон для расчёта долей влияния.",
    formula: "wS * S + wU * U + wP * P + wV * V + wF * F + wC * C_inv"
  },
  {
    id: "critical_infra_boost",
    name: "3. Модель критической инфраструктуры (Аварийный буст ЖКХ)",
    shortName: "Аварийный приоритет ЖКХ",
    description: "Авторская нелинейная модель для г. Экибастуз: при критической серьёзности или срочности (>= 9 баллов) включает повышающий коэффициент 1.5, защищая магистральные теплосети от проигрыша мелким дешёвым задачам.",
    formula: "(severity_current >= 9 or urgency_current >= 9 ? 1.5 : 1.0) * (wS * S + wU * U + wP * (population_current / population_total) * 2.5 + wV * (votes_current / votes_total) * 2) * (F / C)^0.25"
  },
  {
    id: "multiplicative_index",
    name: "4. Мультипликативный индекс (Значимость × Лёгкость / Цена)",
    shortName: "Мультипликативная",
    description: "Возводит факторы реализуемости и стоимости в степень их весов. Сильно штрафует задачи с низкой готовностью и завышенной сметой.",
    formula: "((wS * S^1.5 + wU * U^1.5 + wP * P + wV * V) * (F ^ wF)) / (C ^ wC)"
  },
  {
    id: "bcr_efficiency",
    name: "5. Индекс бюджетной отдачи (Социальный эффект на 1 млн ₸)",
    shortName: "Бюджетная отдача (BCR)",
    description: "Выводит в топ «быстрые победы» — задачи, которые дают максимальный социальный охват и снижение рисков на каждый миллион тенге затрат.",
    formula: "((wS * severity_current + wU * urgency_current) * ((population_current / population_total) + (votes_current / votes_total)) * feasibility_current) / (cost_current ^ wC)"
  }
];

// ============================================================================
// 4. ЭТАЛОННЫЙ ДАТАСЕТ ИЗ 16 ПРОБЛЕМ Г. ЭКИБАСТУЗ (12 evaluated + 4 pending)
// ============================================================================
const PRESET_PROBLEMS = [
  // --------------------------------------------------------------------------
  // ЧАСТЬ А: ОЦЕНЁННЫЕ ПРОБЛЕМЫ В РЕЙТИНГЕ (status: 'evaluated' — 12 объектов)
  // --------------------------------------------------------------------------
  {
    id: "prob_101",
    category: "ЖКХ и теплосети",
    title: "Износ / порыв участка магистральной теплосети",
    details: "Магистраль ТМ-2 в районе 8-го микрорайона (вдоль ул. Машхур Жусупа, дома №42–48). Критический коррозионный износ подающего трубопровода Ø530 мм, зафиксированы свищи и парение в тепловой камере ТК-14.",
    coords: [75.3192, 51.7245],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-12",
    photos: [
      generatePresetPhotoSVG("ЖКХ и теплосети", "АКТ #101", "Мкр. 8, магистраль ТМ-2 (ТК-14)", [75.3192, 51.7245], "12.10.2026", "ИЗНОС 88% • КРИТИЧНО")
    ],
    mergedCount: 3,
    clusterRadius: 115,
    sourcePoints: [[75.3192, 51.7245], [75.3184, 51.7241], [75.3201, 51.7248]],
    sourceDetails: [
      "Мкр. 8, у дома 44: парит из люка теплотрассы, просел грунт.",
      "Ул. Машхур Жусупа, 46: падение давления отопления в трех пятиэтажках.",
      "Тепловая камера ТК-14: затопление горячей водой, требуется замена задвижек."
    ],
    votes: 485,
    severity: 10,
    urgency: 10,
    population: 22400,
    cost: 125.0,
    feasibility: 6
  },
  {
    id: "prob_102",
    category: "ЖКХ и теплосети",
    title: "Аварийное состояние внутриквартального водопровода и канализации",
    details: "Мкр. 6, ул. Строителей, 28–34. Частые порывы стального водовода ХВС Ø200 мм, подтопление подвальных помещений грунтовыми и сточными водами в 7 многоквартирных домах.",
    coords: [75.3118, 51.7195],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-14",
    photos: [
      generatePresetPhotoSVG("ЖКХ и теплосети", "АКТ #102", "Ул. Строителей, 28–34 (мкр. 6)", [75.3118, 51.7195], "14.10.2026", "АВАРИЙНЫЙ ВОДОВОД")
    ],
    mergedCount: 2,
    clusterRadius: 85,
    sourcePoints: [[75.3118, 51.7195], [75.3125, 51.7199]],
    sourceDetails: [
      "Ул. Строителей, 28: постоянные отключения холодной воды из-за порывов.",
      "Ул. Строителей, 32: затоплен подвал, требуется замена 180 м квартальной трубы."
    ],
    votes: 310,
    severity: 9,
    urgency: 9,
    population: 8600,
    cost: 54.0,
    feasibility: 7
  },
  {
    id: "prob_103",
    category: "Дороги и транспорт",
    title: "Разрушение асфальтового покрытия проезжей части (ямочность)",
    details: "Ул. Ауэзова (участок от ул. Абая до ул. Королёва, протяжённость 850 м). Глубокая колейность и выбоины глубиной до 12 см на основном автобусном маршруте.",
    coords: [75.3355, 51.7278],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-15",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "АКТ #103", "Ул. Ауэзова (уч. Абая — Королёва)", [75.3355, 51.7278], "15.10.2026", "ЯМОЧНОСТЬ > 12 СМ")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3355, 51.7278]],
    sourceDetails: ["Ул. Ауэзова: разрушение верхнего слоя асфальта на автобусной полосе."],
    votes: 392,
    severity: 8,
    urgency: 7,
    population: 19500,
    cost: 68.0,
    feasibility: 8
  },
  {
    id: "prob_104",
    category: "Дороги и транспорт",
    title: "Отсутствие / засорение дождеприёмника ливневой канализации",
    details: "Привокзальная площадь и пересечение ул. Бухар Жырау — ул. Горняков. При выпадении осадков и весеннем снеготаянии образуется глубокое подтопление проезжей части и пешеходных переходов.",
    coords: [75.3085, 51.7372],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-16",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "АКТ #104", "Привокзальная пл. / ул. Бухар Жырау", [75.3085, 51.7372], "16.10.2026", "ПОДТОПЛЕНИЕ УЗЛА")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3085, 51.7372]],
    sourceDetails: ["Привокзальная площадь: забиты ливневые колодцы, требуется промывка и врезка 2 дождеприёмников."],
    votes: 265,
    severity: 7,
    urgency: 8,
    population: 14200,
    cost: 32.0,
    feasibility: 8
  },
  {
    id: "prob_105",
    category: "Освещение и электросети",
    title: "Отсутствие уличного освещения на участке улицы / во дворе",
    details: "Ул. Сатпаева (вдоль микрорайона 22 и подхода к СОШ №26). Не работают 18 светодиодных светильников из-за повреждения питающего кабеля, опасный неосвещённый переход для школьников в вечернее время.",
    coords: [75.3440, 51.7188],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-17",
    photos: [
      generatePresetPhotoSVG("Освещение и электросети", "АКТ #105", "Ул. Сатпаева (мкр. 22, подход к СОШ №26)", [75.3440, 51.7188], "17.10.2026", "18 ОПОР БЕЗ СВЕТА")
    ],
    mergedCount: 2,
    clusterRadius: 90,
    sourcePoints: [[75.3440, 51.7188], [75.3448, 51.7192]],
    sourceDetails: [
      "Ул. Сатпаева, мкр. 22: полная темнота вдоль дороги к школе №26.",
      "Пешеходный переход у мкр. 22: не горят фонари уже три недели."
    ],
    votes: 418,
    severity: 8,
    urgency: 9,
    population: 16800,
    cost: 18.5,
    feasibility: 9
  },
  {
    id: "prob_106",
    category: "Дороги и транспорт",
    title: "Неисправность светофорного объекта или отсутствие дорожных знаков",
    details: "Перекрёсток ул. Машхур Жусупа — ул. Абая. Сбои контроллера светофора в часы пик, выгорание светодиодных секций пешеходного светофора и отсутствие дублирующих знаков «Пешеходный переход».",
    coords: [75.3264, 51.7312],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-17",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "АКТ #106", "Перекрёсток Машхур Жусупа — Абая", [75.3264, 51.7312], "17.10.2026", "СБОЙ СВЕТОФОРА")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3264, 51.7312]],
    sourceDetails: ["Перекрёсток М. Жусупа и Абая: мигает жёлтым в час пик, опасный переход."],
    votes: 290,
    severity: 8,
    urgency: 9,
    population: 26000,
    cost: 12.0,
    feasibility: 10
  },
  // ПАРА ОЦЕНЁННЫХ ПРОБЛЕМ В МКР. 19 НА РАССТОЯНИИ ~82 МЕТРА (С ОДИНАКОВЫМ TITLE ДЛЯ ТЕСТА КЛАСТЕРИЗАЦИИ EVALUATED)
  {
    id: "prob_107",
    category: "Освещение и электросети",
    title: "Отсутствие уличного освещения на участке улицы / во дворе",
    details: "Мкр. 19, внутридворовой проезд у домов №12 и №14. Демонтированы старые светильники РКУ, новые кронштейны и СИП-линия не установлены.",
    coords: [75.3392, 51.7224],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-18",
    photos: [
      generatePresetPhotoSVG("Освещение и электросети", "АКТ #107", "Мкр. 19, дворы домов №12–14", [75.3392, 51.7224], "18.10.2026", "ДВОР БЕЗ ОСВЕЩЕНИЯ")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3392, 51.7224]],
    sourceDetails: ["Мкр. 19, дом 12: во дворе темно после 18:00, нет фонарей на опорах."],
    votes: 145,
    severity: 6,
    urgency: 7,
    population: 4200,
    cost: 9.5,
    feasibility: 9
  },
  {
    id: "prob_108",
    category: "Освещение и электросети",
    title: "Отсутствие уличного освещения на участке улицы / во дворе",
    details: "Мкр. 19, детская площадка и аллея между домами №16 и №18 (в 80 м от дома №12). Оборван питающий провод на 4 опорах освещения.",
    coords: [75.3401, 51.7229],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-18",
    photos: [
      generatePresetPhotoSVG("Освещение и электросети", "АКТ #108", "Мкр. 19, аллея у домов №16–18", [75.3401, 51.7229], "18.10.2026", "ОБРЫВ СИП-ЛИНИИ")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3401, 51.7229]],
    sourceDetails: ["Мкр. 19, дом 16: не освещается детская площадка и проход к остановке."],
    votes: 132,
    severity: 7,
    urgency: 7,
    population: 4500,
    cost: 8.5,
    feasibility: 9
  },
  {
    id: "prob_109",
    category: "ЖКХ и теплосети",
    title: "Необходимость балансировки и промывки квартального теплового узла",
    details: "Мкр. 17, ЦТП-9 (ул. Королёва, 72–80). Разбалансировка гидравлического режима: в концевых домах ветки температура теплоносителя занижена на 8–10 °C от температурного графика.",
    coords: [75.3485, 51.7262],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-19",
    photos: [
      generatePresetPhotoSVG("ЖКХ и теплосети", "АКТ #109", "Мкр. 17, тепловой пункт ЦТП-9", [75.3485, 51.7262], "19.10.2026", "ГИДРАВЛИЧЕСКИЙ ПЕРЕКОС")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3485, 51.7262]],
    sourceDetails: ["Ул. Королёва, 76: слабая циркуляция отопления в угловых подъездах, нужна установка балансировочных клапанов."],
    votes: 276,
    severity: 8,
    urgency: 9,
    population: 9800,
    cost: 24.0,
    feasibility: 8
  },
  {
    id: "prob_110",
    category: "Благоустройство и экология",
    title: "Необходимость озеленения и ремонта поливочного водопровода",
    details: "Парк культуры и отдыха «Шахтёр» (восточный сектор). Выход из строя насосной группы и разводки летнего поливочного водопровода, риск гибели 450 молодых саженцев сосны и берёзы.",
    coords: [75.3210, 51.7345],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-19",
    photos: [
      generatePresetPhotoSVG("Благоустройство и экология", "АКТ #110", "Парк «Шахтёр» (восточный сектор)", [75.3210, 51.7345], "19.10.2026", "РЕМОНТ ПОЛИВА ПАРКА")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3210, 51.7345]],
    sourceDetails: ["Парк Шахтёр: требуется замена поливочных труб ПНД и восстановление зелёного фонда."],
    votes: 215,
    severity: 5,
    urgency: 5,
    population: 31000,
    cost: 36.0,
    feasibility: 7
  },
  {
    id: "prob_111",
    category: "Благоустройство и экология",
    title: "Аварийное состояние детской / спортивной площадки",
    details: "Ул. Энергетиков, двор домов №35–39. Износ травмобезопасного тартанового покрытия, поломка игровых комплексов и ограждения футбольного корта.",
    coords: [75.3145, 51.7295],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-20",
    photos: [
      generatePresetPhotoSVG("Благоустройство и экология", "АКТ #111", "Ул. Энергетиков, 35–39 (дворовой корт)", [75.3145, 51.7295], "20.10.2026", "ИЗНОС ДЕТСКОЙ ПЛОЩАДКИ")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3145, 51.7295]],
    sourceDetails: ["Ул. Энергетиков, 37: сломаны качели и порвана сетка мини-футбольного поля."],
    votes: 178,
    severity: 6,
    urgency: 5,
    population: 3400,
    cost: 16.5,
    feasibility: 9
  },
  {
    id: "prob_112",
    category: "Дороги и транспорт",
    title: "Разрушение тротуара и пешеходных дорожек",
    details: "Ул. Торайгырова (от ул. Машхур Жусупа до городской больницы). Разрушение брусчатки и бордюрного камня, отсутствие пандусов для маломобильных граждан и колясок.",
    coords: [75.3310, 51.7368],
    status: "evaluated",
    rejectReason: "",
    createdAt: "2026-10-21",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "АКТ #112", "Ул. Торайгырова (маршрут к горбольнице)", [75.3310, 51.7368], "21.10.2026", "ТРОТУАР И ПАНДУСЫ")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3310, 51.7368]],
    sourceDetails: ["Ул. Торайгырова: просела тротуарная плитка на подходе к поликлинике и больнице."],
    votes: 234,
    severity: 6,
    urgency: 6,
    population: 12500,
    cost: 29.0,
    feasibility: 8
  },

  // --------------------------------------------------------------------------
  // ЧАСТЬ Б: НОВЫЕ ЗАЯВКИ ОТ ЖИТЕЛЕЙ В ОЧЕРЕДИ ОЦЕНЩИКА (status: 'pending' — 4 объекта)
  // Специально сгруппированы в 2 пары близких точек (64 м и 68 м) с одинаковым title
  // для наглядной демонстрации кластеризации в радиусе R = 100..150 м!
  // --------------------------------------------------------------------------

  // Кластерная пара #1 (расстояние между точками = 64 метра, мкр. 8)
  {
    id: "prob_201",
    category: "ЖКХ и теплосети",
    title: "Нарушение теплоизоляции трубопровода / парение из камеры",
    details: "Мкр. 8, внутриквартальная воздушная теплотрасса за домом №18. Сорвана минераловатная изоляция на протяжении 40 метров, греется улица.",
    coords: [75.3168, 51.7226],
    status: "pending",
    rejectReason: "",
    createdAt: "2026-10-25",
    photos: [
      generatePresetPhotoSVG("ЖКХ и теплосети", "ЗАЯВКА #201", "Мкр. 8, теплотрасса за домом №18", [75.3168, 51.7226], "25.10.2026", "ФОТО ЖИТЕЛЯ #1")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3168, 51.7226]],
    sourceDetails: ["Мкр. 8, за домом №18: голая труба отопления без изоляции на протяжении 40 метров."],
    votes: 64,
    severity: 7,
    urgency: 8,
    population: 5200,
    cost: 14.0,
    feasibility: 8
  },
  {
    id: "prob_202",
    category: "ЖКХ и теплосети",
    title: "Нарушение теплоизоляции трубопровода / парение из камеры",
    details: "Мкр. 8, у трансформаторной будки между домами №18 и №20 (в 60 м от первого участка). Сильное парение из люка тепловой камеры, открыта крышка люка.",
    coords: [75.3175, 51.7230],
    status: "pending",
    rejectReason: "",
    createdAt: "2026-10-25",
    photos: [
      generatePresetPhotoSVG("ЖКХ и теплосети", "ЗАЯВКА #202", "Мкр. 8, камера между домами №18 и №20", [75.3175, 51.7230], "25.10.2026", "ФОТО ЖИТЕЛЯ #2")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3175, 51.7230]],
    sourceDetails: ["Мкр. 8, между домами 18 и 20: парит из тепловой камеры, нарушена изоляция узла."],
    votes: 82,
    severity: 8,
    urgency: 9,
    population: 5600,
    cost: 11.0,
    feasibility: 8
  },

  // Кластерная пара #2 (расстояние между точками = 68 метров, пересечение М. Жусупа — Торайгырова)
  {
    id: "prob_203",
    category: "Дороги и транспорт",
    title: "Разрушение асфальтового покрытия проезжей части (ямочность)",
    details: "Ул. Машхур Жусупа, 88 (перед перекрёстком с ул. Торайгырова). Серия острых выбоин в правом ряду вокруг чугунного люка колодца.",
    coords: [75.3248, 51.7352],
    status: "pending",
    rejectReason: "",
    createdAt: "2026-10-26",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "ЗАЯВКА #203", "Ул. Машхур Жусупа, 88 (правый ряд)", [75.3248, 51.7352], "26.10.2026", "ФОТО ЖИТЕЛЯ #1")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3248, 51.7352]],
    sourceDetails: ["Ул. Машхур Жусупа, 88: глубокая яма вокруг люка в правом ряду, машины резко маневрируют."],
    votes: 53,
    severity: 7,
    urgency: 8,
    population: 15000,
    cost: 9.0,
    feasibility: 9
  },
  {
    id: "prob_204",
    category: "Дороги и транспорт",
    title: "Разрушение асфальтового покрытия проезжей части (ямочность)",
    details: "Перекрёсток ул. Машхур Жусупа — ул. Торайгырова (выезд с остановки в 65 м от дома №88). Разбит асфальт в кармане автобусной остановки.",
    coords: [75.3256, 51.7356],
    status: "pending",
    rejectReason: "",
    createdAt: "2026-10-26",
    photos: [
      generatePresetPhotoSVG("Дороги и транспорт", "ЗАЯВКА #204", "Перекрёсток М. Жусупа — Торайгырова", [75.3256, 51.7356], "26.10.2026", "ФОТО ЖИТЕЛЯ #2")
    ],
    mergedCount: 1,
    clusterRadius: 0,
    sourcePoints: [[75.3256, 51.7356]],
    sourceDetails: ["Остановка на перекрёстке М. Жусупа — Торайгырова: глубокие выбоины в автобусном кармане."],
    votes: 47,
    severity: 7,
    urgency: 7,
    population: 16200,
    cost: 11.5,
    feasibility: 9
  }
];

// ============================================================================
// 5. ОФЛАЙН-СХЕМА Г. ЭКИБАСТУЗ (GeoJSON контур и главные магистрали для карты)
// ============================================================================
const EKIBASTUZ_GEOJSON = {
  type: "FeatureCollection",
  features: [
    // Городской периметр Экибастуза
    {
      type: "Feature",
      properties: { name: "Граница жилого массива г. Экибастуз", kind: "boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [75.2980, 51.7440],
          [75.3560, 51.7440],
          [75.3560, 51.7120],
          [75.2980, 51.7120],
          [75.2980, 51.7440]
        ]]
      }
    },
    // Ул. Машхур Жусупа (центральная ось Север — Юг)
    {
      type: "Feature",
      properties: { name: "ул. Машхур Жусупа", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3250, 51.7130], [75.3255, 51.7250], [75.3260, 51.7420]]
      }
    },
    // Ул. Ауэзова (восточнее центральной оси)
    {
      type: "Feature",
      properties: { name: "ул. Ауэзова", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3350, 51.7135], [75.3355, 51.7280], [75.3360, 51.7415]]
      }
    },
    // Ул. Энергетиков / Бухар Жырау (западная ось)
    {
      type: "Feature",
      properties: { name: "ул. Энергетиков — ул. Бухар Жырау", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3140, 51.7140], [75.3145, 51.7295], [75.3085, 51.7375]]
      }
    },
    // Ул. Сатпаева (южная магистраль Запад — Восток)
    {
      type: "Feature",
      properties: { name: "ул. Сатпаева", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3020, 51.7185], [75.3255, 51.7187], [75.3520, 51.7190]]
      }
    },
    // Ул. Абая (центральная широтная ось Запад — Восток)
    {
      type: "Feature",
      properties: { name: "ул. Абая", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3020, 51.7310], [75.3264, 51.7312], [75.3520, 51.7314]]
      }
    },
    // Ул. Торайгырова (северная широтная ось)
    {
      type: "Feature",
      properties: { name: "ул. Торайгырова", kind: "arterial" },
      geometry: {
        type: "LineString",
        coordinates: [[75.3050, 51.7365], [75.3256, 51.7367], [75.3500, 51.7370]]
      }
    }
  ]
};

// ============================================================================
// 6. НАЧАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ ПО УМОЛЧАНИЮ
// ============================================================================
const DEFAULT_APP_STATE = {
  activeRole: "admin", // 'citizen' | 'evaluator' | 'admin'
  selectedPresetId: "relative_share_model",
  customFormula: FORMULA_PRESETS[0].formula,
  weights: {
    wS: 0.25,
    wU: 0.25,
    wP: 0.20,
    wV: 0.10,
    wF: 0.10,
    wC: 0.10
  },
  budgetLimit: 300,              // Доступный городской бюджет (млн ₸)
  budgetStrategy: "sequential",  // 'sequential' (строго по рейтингу) | 'greedy_fill' (умное дозаполнение остатка)
  clusterRadiusMeters: 150,      // Радиус пространственного объединения однотипных проблем R (м)
  categoryFilter: "all",
  statusFilter: "all",
  selectedProblemId: "prob_101",
  baselineRanks: null            // Слот А для фиксации базового рейтинга и расчёта смещений рангов
};

// Экспорт в глобальную область видимости для бесшовной работы всех модулей
window.CityMindData = {
  DEFAULT_PROBLEM_CATALOG,
  FORMULA_VARIABLES,
  FORMULA_PRESETS,
  PRESET_PROBLEMS,
  EKIBASTUZ_GEOJSON,
  DEFAULT_APP_STATE,
  generatePresetPhotoSVG,
  EKIBASTUZ_CENTER: [75.3260, 51.7285]
};