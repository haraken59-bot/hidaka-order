(() => {
  'use strict';

  const STORAGE_KEY = 'hidaka-order-v1';
  const FULL_BACKUP_FORMAT = 'hidaka-order-full-backup';
  const FULL_BACKUP_SCHEMA_VERSION = 1;
  const DEFAULT_MENU_VERSION = 'hidaka-menu-2026-08-31-v1';
  const FALLBACK_MENU_VERSION = 'fallback-menu-v1';
  const CATEGORY_LABEL = { drink: 'お酒', small: '小皿・つまみ', skewer: '串', main: '一品', finish: '締め', dessert: 'デザート', fee: '割代' };
  const MOOD_LABEL = { pork: '豚', chicken: '鶏', seafood: '魚介', vegetable: '野菜', spicy: '辛いもの' };
  const TAG_LABEL = { pork: '豚', chicken: '鶏', beef: '牛', seafood: '魚介', vegetable: '野菜', spicy: '辛いもの', light: '軽め', drink: '飲み物', finish: '締め', rice: 'ご飯', noodle: '麺', soup: '汁物', dessert: 'デザート', sweet: '甘いもの', alcohol: 'アルコール', nonalcohol: 'ノンアルコール', shishito: 'ししとう' };
  const TAG_CANONICAL = { pork: 'pork', '豚': 'pork', chicken: 'chicken', '鶏': 'chicken', beef: 'beef', '牛': 'beef', seafood: 'seafood', '魚介': 'seafood', vegetable: 'vegetable', '野菜': 'vegetable', spicy: 'spicy', '辛いもの': 'spicy', light: 'light', '軽め': 'light', drink: 'drink', '飲み物': 'drink', finish: 'finish', '締め': 'finish', rice: 'rice', 'ご飯': 'rice', noodle: 'noodle', '麺': 'noodle', soup: 'soup', '汁物': 'soup', dessert: 'dessert', 'デザート': 'dessert', sweet: 'sweet', '甘いもの': 'sweet', alcohol: 'alcohol', 'アルコール': 'alcohol', nonalcohol: 'nonalcohol', 'ノンアルコール': 'nonalcohol', shishito: 'shishito', 'ししとう': 'shishito' };
  const FOOD_MOOD_TAGS = new Set(['pork', 'chicken', 'beef', 'seafood', 'vegetable', 'spicy']);
  const KEEP_SHOCHU_FEE = { id: 'keep-shochu-fee', name: '割代（焼酎キープ）', price: 220, category: 'fee', tags: [], actual: true };
  const ORDER_BUDGET = 3000;
  const PENDING_REMINDER_MS = 10 * 60 * 1000;
  const fallbackMenu = [
    { id: 'highball', name: 'ハイボール', price: 380, category: 'drink', tags: ['drink', 'light'], actual: false },
    { id: 'beer', name: '生ビール（中）', price: 520, category: 'drink', tags: ['drink'], actual: false },
    { id: 'lemon-sour', name: 'レモンサワー', price: 390, category: 'drink', tags: ['drink', 'light'], actual: false },
    { id: 'shochu', name: '焼酎 水割り', price: 360, category: 'drink', tags: ['drink'], actual: false },
    { id: 'vinegar-motsu', name: '酢モツ', price: 360, category: 'small', tags: ['pork', 'light'], actual: false },
    { id: 'edamame', name: '枝豆', price: 300, category: 'small', tags: ['vegetable', 'light'], actual: false },
    { id: 'chilled-tofu', name: '冷奴', price: 300, category: 'small', tags: ['vegetable', 'light'], actual: false },
    { id: 'potato-salad', name: 'ポテトサラダ', price: 350, category: 'small', tags: ['vegetable'], actual: false },
    { id: 'kimchi', name: '白菜キムチ', price: 280, category: 'small', tags: ['vegetable', 'spicy', 'light'], actual: false },
    { id: 'sesame-mackerel', name: 'ゴマサバ', price: 680, category: 'small', tags: ['seafood'], actual: false },
    { id: 'shishito', name: 'ししとう串', price: 180, category: 'skewer', tags: ['vegetable', 'light'], actual: false },
    { id: 'pork-tongue', name: '豚タン串', price: 190, category: 'skewer', tags: ['pork'], actual: false },
    { id: 'pork-kashira', name: 'かしら串', price: 180, category: 'skewer', tags: ['pork'], actual: false },
    { id: 'pork-harumaki', name: 'ハラミ串', price: 200, category: 'skewer', tags: ['pork'], actual: false },
    { id: 'liver', name: 'レバー串', price: 180, category: 'skewer', tags: ['pork'], actual: false },
    { id: 'chicken-thigh', name: 'もも串', price: 190, category: 'skewer', tags: ['chicken'], actual: false },
    { id: 'chicken-skin', name: '皮串', price: 180, category: 'skewer', tags: ['chicken'], actual: false },
    { id: 'chicken-wing', name: '手羽先', price: 250, category: 'skewer', tags: ['chicken'], actual: false },
    { id: 'green-onion', name: 'ねぎま串', price: 190, category: 'skewer', tags: ['chicken', 'vegetable'], actual: false },
    { id: 'spicy-chorizo', name: 'チョリソー串', price: 230, category: 'skewer', tags: ['pork', 'spicy'], actual: false },
    { id: 'fried-chicken', name: '若鶏の唐揚げ', price: 490, category: 'main', tags: ['chicken'], actual: false },
    { id: 'motsu-stew', name: 'もつ煮込み', price: 480, category: 'main', tags: ['pork'], actual: false },
    { id: 'fried-potato', name: 'ポテトフライ', price: 390, category: 'main', tags: ['vegetable'], actual: false },
    { id: 'yakisoba', name: 'ソース焼きそば', price: 520, category: 'finish', tags: ['pork'], actual: false },
    { id: 'rice-bowl', name: 'おにぎり（鮭）', price: 250, category: 'finish', tags: ['seafood', 'light'], actual: false },
    { id: 'ramen', name: '中華そば', price: 550, category: 'finish', tags: ['finish'], actual: false }
  ];

  let defaultMenu = fallbackMenu;
  let activeDefaultMenuVersion = FALLBACK_MENU_VERSION;

  function cloneMenu(menu) { return menu.map(item => ({ ...item, tags: [...item.tags] })); }
  function defaultState() {
    const menu = defaultMenu.map(item => ({ ...item, tags: item.tags.map(localizeTag) }));
    return { defaultMenuVersion: activeDefaultMenuVersion, menu, initialMenu: cloneMenu(menu), history: [], preferences: { budget: ORDER_BUDGET, hunger: 'normal', skewerCount: 3, drink: 'highball', moods: [], mustShishito: true, wantFinish: false, avoidRecent: true }, outOfStock: { date: todayKey(), ids: [] }, pendingOrder: null };
  }
  let state;
  let currentOrder = null;
  let pendingReminderTimer = null;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const yen = (value) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
  function todayKey() { return new Intl.DateTimeFormat('sv-SE').format(new Date()); }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.menu) || !Array.isArray(saved.history)) return defaultState();
      const base = defaultState();
      const outOfStock = saved.outOfStock && typeof saved.outOfStock.date === 'string' && Array.isArray(saved.outOfStock.ids) ? { date: saved.outOfStock.date, ids: saved.outOfStock.ids.map(String) } : base.outOfStock;
      const shouldInstallNewBaseMenu = saved.defaultMenuVersion !== activeDefaultMenuVersion;
      const menu = shouldInstallNewBaseMenu ? cloneMenu(base.menu) : saved.menu.map(normalizeMenuItem).filter(Boolean);
      const initialMenu = shouldInstallNewBaseMenu ? cloneMenu(base.initialMenu) : (Array.isArray(saved.initialMenu) ? saved.initialMenu.map(normalizeMenuItem).filter(Boolean) : cloneMenu(menu));
      return { ...base, ...saved, defaultMenuVersion: activeDefaultMenuVersion, preferences: { ...base.preferences, ...(saved.preferences || {}), avoidRecent: true }, outOfStock, menu, initialMenu, history: saved.history.map(normalizeHistoryItem).filter(Boolean), pendingOrder: normalizePendingOrder(saved.pendingOrder) };
    } catch { return defaultState(); }
  }

  async function loadDefaultMenu() {
    try {
      const response = await fetch('./data/hidaka-menu.csv', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseCsv(await response.text());
      const menu = rows.map((row, index) => normalizeMenuItem({ ...row, id: `base-${String(index + 1).padStart(3, '0')}` })).filter(Boolean);
      if (!menu.length) throw new Error('基本メニューが空です。');
      return { menu, version: DEFAULT_MENU_VERSION };
    } catch (error) {
      console.warn('基本メニューCSVを読み込めないため、内蔵メニューを使います。', error);
      return { menu: fallbackMenu, version: FALLBACK_MENU_VERSION };
    }
  }

  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function getTodayOutOfStockIds() {
    const today = todayKey();
    if (state.outOfStock.date !== today) { state.outOfStock = { date: today, ids: [] }; saveState(); }
    return state.outOfStock.ids;
  }
  function markOutOfStock(ids) {
    const current = new Set(getTodayOutOfStockIds());
    ids.forEach(id => current.add(id));
    state.outOfStock = { date: todayKey(), ids: [...current] };
    saveState();
    return state.outOfStock.ids;
  }
  function uid() { return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function canonicalTag(tag) { return TAG_CANONICAL[String(tag || '').trim().toLowerCase()] || String(tag || '').trim().toLowerCase(); }
  function localizeTag(tag) { const original = String(tag || '').trim(); return TAG_LABEL[canonicalTag(original)] || original; }
  function hasTag(item, target) { return item.tags.some(tag => canonicalTag(tag) === canonicalTag(target)); }
  function normalizeTags(tags) {
    const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(/[|,、]/);
    return rawTags.map(localizeTag).filter(Boolean);
  }
  function normalizeMenuItem(raw) {
    const name = String(raw.name ?? raw['料理名'] ?? raw['メニュー名'] ?? '').trim();
    const price = Number(raw.price ?? raw['価格'] ?? raw['値段']);
    if (!name || !Number.isFinite(price) || price < 0) return null;
    const categoryValue = String(raw.category ?? raw['分類'] ?? 'small').toLowerCase();
    const categoryMap = { 'お酒': 'drink', '飲み物': 'drink', '小皿': 'small', '小皿・つまみ': 'small', 'つまみ': 'small', '串': 'skewer', '焼き鳥': 'skewer', '一品': 'main', '主菜': 'main', '締め': 'finish', 'ご飯': 'finish', 'デザート': 'dessert', '甘味': 'dessert' };
    const category = CATEGORY_LABEL[categoryValue] ? categoryValue : (categoryMap[categoryValue] || 'small');
    const actualValue = raw.actual ?? raw['実額'] ?? raw['実売価格'];
    return { id: String(raw.id || raw['ID'] || uid()), name, price: Math.round(price), category, tags: normalizeTags(raw.tags ?? raw['タグ']), actual: actualValue === true || String(actualValue).toLowerCase() === 'true' || String(actualValue) === '1' };
  }
  function normalizeHistoryItem(raw) {
    const date = String(raw.date ?? raw['日付'] ?? '').slice(0, 10);
    const order = raw.items ?? raw.order ?? raw['注文'] ?? raw['注文内容'];
    const items = Array.isArray(order) ? order.map(item => typeof item === 'string' ? { name: item } : { ...item, name: item.name ?? item['料理名'] ?? item['メニュー名'] }).filter(item => item && item.name) : String(order || '').split(/[|｜]/).map(name => name.trim()).filter(Boolean).map(name => ({ name }));
    return date && items.length ? { id: String(raw.id || uid()), date, items } : null;
  }
  function normalizePendingOrder(raw) {
    if (!raw || !raw.order || !Array.isArray(raw.order.items)) return null;
    const items = raw.order.items.map(item => {
      const normalized = normalizeMenuItem(item);
      if (!normalized) return null;
      return {
        ...normalized,
        ...(item.manuallyAdded ? { manuallyAdded: true } : {}),
        ...(item.recommendationReason ? { recommendationReason: String(item.recommendationReason) } : {})
      };
    }).filter(Boolean);
    if (!items.length) return null;
    const basePreferences = defaultState().preferences;
    const preferences = { ...basePreferences, ...(raw.order.preferences || {}), budget: ORDER_BUDGET, avoidRecent: true };
    preferences.moods = Array.isArray(preferences.moods) ? preferences.moods.map(String) : [];
    preferences.skewerCount = Math.max(0, Math.round(Number(preferences.skewerCount) || 0));
    const savedAtValue = String(raw.savedAt || '');
    const savedAt = Number.isFinite(new Date(savedAtValue).getTime()) ? savedAtValue : new Date().toISOString();
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? String(raw.date) : todayKey(),
      savedAt,
      order: {
        items,
        total: items.reduce((sum, item) => sum + item.price, 0),
        budget: ORDER_BUDGET,
        unavailable: Array.isArray(raw.order.unavailable) ? raw.order.unavailable.map(String) : [],
        preferences,
        excludedIds: Array.isArray(raw.order.excludedIds) ? raw.order.excludedIds.map(String) : []
      }
    };
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }

  function init() {
    $('#todayLabel').textContent = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
    getTodayOutOfStockIds();
    renderMoodChoices();
    applyPreferences();
    saveState();
    $('#preferenceForm').addEventListener('submit', event => { event.preventDefault(); currentOrder = createOrder(readPreferences()); renderOrder(currentOrder, 'new'); });
    $('#skewerCount').addEventListener('input', syncSkewerCount);
    $('#mustShishito').addEventListener('change', () => {
      if ($('#mustShishito').checked && Number($('#skewerCount').value) === 0) $('#skewerCount').value = 1;
      syncSkewerCount();
    });
    $('#dataButton').addEventListener('click', openDataDialog);
    $('#addMenuItem').addEventListener('click', () => openMenuForm());
    $('#menuItemForm').addEventListener('submit', saveMenuItem);
    $('#cancelMenuEdit').addEventListener('click', () => $('#menuItemDialog').close());
    $('#addToOrderForm').addEventListener('submit', addItemToCurrentOrder);
    $('#cancelOrderAddition').addEventListener('click', () => $('#addToOrderDialog').close());
    $('#downloadFullBackup').addEventListener('click', downloadFullBackup);
    $('#restoreFullBackupFile').addEventListener('change', restoreFullBackup);
    $('#importFile').addEventListener('change', importFile);
    $('#downloadCurrentMenu').addEventListener('click', downloadCurrentMenuBackup);
    $('#downloadMenuTemplate').addEventListener('click', downloadDefaultMenu);
    $('#downloadHistoryTemplate').addEventListener('click', () => download('hidaka-history-sample.csv', '日付,注文\n2026-08-01,ハイボール|酢モツ|ししとう串|手羽先\n'));
    $('#resetData').addEventListener('click', resetData);
    $('#registerInitialMenu').addEventListener('click', registerInitialMenu);
    $('#pendingOrderForm').addEventListener('submit', event => { event.preventDefault(); recordCurrentOrder(); });
    $('#inspectPendingOrder').addEventListener('click', inspectPendingOrder);
    $('#discardPendingOrder').addEventListener('click', discardPendingOrder);
    renderHistorySummary();
    restorePendingOrder();
  }

  function applyPreferences() {
    const p = state.preferences;
    p.budget = ORDER_BUDGET;
    $('#skewerCount').value = p.skewerCount;
    syncSkewerCount();
    $(`input[name="hunger"][value="${p.hunger}"]`).checked = true;
    p.drink = renderDrinkOptions(p.drink);
    $$('input[name="mood"]').forEach(input => { input.checked = p.moods.includes(input.value); });
    $('#mustShishito').checked = p.mustShishito;
    $('#wantFinish').checked = p.wantFinish;
    p.avoidRecent = true;
  }

  function renderMoodChoices() {
    const container = $('#moodChoices');
    const selected = new Set(state.preferences?.moods || []);
    const tags = new Map();
    state.menu.forEach(item => item.tags.forEach(tag => {
      const canonical = canonicalTag(tag);
      if (!FOOD_MOOD_TAGS.has(canonical)) return;
      const current = tags.get(canonical) || { label: localizeTag(tag), count: 0 };
      current.count += 1;
      tags.set(canonical, current);
    }));
    const choices = [...tags.entries()].sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, 'ja')).slice(0, 5);
    container.replaceChildren(...choices.map(([value, tagInfo]) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'mood';
      input.value = value;
      input.checked = selected.has(value);
      label.append(input, ` ${tagInfo.label}`);
      return label;
    }));
  }

  function readPreferences() {
    const preferences = {
      budget: ORDER_BUDGET, hunger: $('input[name="hunger"]:checked').value, skewerCount: Number($('#skewerCount').value), drink: $('#drink').value,
      moods: $$('input[name="mood"]:checked').map(input => input.value), mustShishito: $('#mustShishito').checked,
      wantFinish: $('#wantFinish').checked, avoidRecent: true
    };
    state.preferences = preferences;
    saveState();
    return preferences;
  }

  function syncSkewerCount() {
    const count = Number($('#skewerCount').value);
    if (count === 0) $('#mustShishito').checked = false;
    $('#skewerCountOutput').value = `${count}本`;
  }

  function renderDrinkOptions(selectedValue) {
    const select = $('#drink');
    const drinks = state.menu.filter(item => item.category === 'drink');
    const currentValue = selectedValue ?? select.value ?? state.preferences.drink;
    const directMatch = drinks.find(item => item.id === currentValue);
    const legacyMatch = drinks.find(item => matchesSelectedDrink(item, currentValue));
    const value = directMatch?.id || legacyMatch?.id || 'none';
    const choices = [{ value: 'none', label: '飲まない' }, ...drinks.map(item => ({ value: item.id, label: `${item.name}（${yen(item.price)}）` }))];
    select.replaceChildren(...choices.map(choice => {
      const option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      return option;
    }));
    select.value = value;
    return value;
  }

  function historyNameKey(name) {
    return String(name || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  }

  function sortedHistory() {
    return state.history
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.index - a.index)
      .map(({ entry }) => entry);
  }

  function recentOrderStats() {
    const weights = [9, 5, 2];
    const penalties = new Map();
    const latest = new Set();
    const orders = sortedHistory().slice(0, weights.length);
    orders.forEach((entry, orderIndex) => {
      const names = new Set(entry.items.map(item => historyNameKey(item.name)).filter(Boolean));
      names.forEach(name => penalties.set(name, (penalties.get(name) || 0) + weights[orderIndex]));
      if (orderIndex === 0) names.forEach(name => latest.add(name));
    });
    return {
      penalty: item => penalties.get(historyNameKey(item.name)) || 0,
      preferNotLatest: options => {
        const alternatives = options.filter(item => !latest.has(historyNameKey(item.name)));
        return alternatives.length ? alternatives : options;
      }
    };
  }

  function matchesSelectedDrink(item, drink) {
    const text = `${item.name}|${item.tags.join('|')}`.toLowerCase();
    const patterns = {
      highball: /ハイボール|highball/,
      beer: /ビール|beer/,
      sour: /サワー|酎ハイ|sour|chu-?hai/
    };
    return Boolean(patterns[drink]?.test(text));
  }

  function budgetGuidance(items, budget) {
    const recommendedItems = items.filter(item => !item.manuallyAdded);
    const recommendedTotal = recommendedItems.reduce((sum, item) => sum + item.price, 0);
    if (recommendedTotal <= budget) return '';
    const highPriced = recommendedItems.filter(item => item.category !== 'fee' && item.price >= budget * 0.3);
    const details = highPriced.length
      ? ` 高額品: ${highPriced.map(item => `${item.name}（${item.recommendationReason || '指定条件を優先'}）`).join('・')}`
      : '';
    return `目安予算 ${yen(budget)} を ${yen(recommendedTotal - budget)} 超えています。指定した条件と各商品の選定理由を優先しました。${details}`;
  }

  function createOrder(p, excludedIds = getTodayOutOfStockIds()) {
    const excluded = new Set(excludedIds);
    const selected = [];
    const add = (item, recommendationReason = '') => {
      if (item && !excluded.has(item.id) && !selected.some(choice => choice.name === item.name)) selected.push({ ...item, recommendationReason });
      return item;
    };
    const findByName = name => state.menu.find(item => item.name === name);
    const recent = recentOrderStats();
    const candidates = (category) => state.menu.filter(item => (!category || item.category === category) && !excluded.has(item.id)).filter(item => !selected.some(choice => choice.name === item.name));
    const score = (item, kind) => {
      let value = Math.random() * 0.8;
      if (p.moods.some(tag => hasTag(item, tag))) value += 5;
      value -= recent.penalty(item);
      if (item.category !== 'skewer' && p.hunger === 'light' && hasTag(item, 'light')) value += 1.7;
      if (item.category !== 'skewer' && p.hunger === 'hearty' && ['main', 'finish'].includes(item.category)) value += 1.5;
      return value - item.price / 12000;
    };
    const reasonFor = (item, kind) => {
      if (!item) return '';
      const moodMatches = p.moods.filter(tag => hasTag(item, tag)).map(tag => MOOD_LABEL[tag] || TAG_LABEL[tag] || tag);
      if (moodMatches.length) return `今日の気分「${moodMatches.join('・')}」に合うため`;
      if (item.price >= p.budget * 0.3) return '高額品ですが、普段と違う一品を楽しむ変化枠として';
      if (recent.penalty(item) === 0 && state.history.length) return '最近の注文と重ならないため';
      if (kind === 'main') return '食事全体にボリュームを加えるため';
      if (kind === 'finish') return '指定された締めとして';
      if (kind === 'fallback') return '料理全体のバランスを補うため';
      return '料理全体のバランスを整えるため';
    };
    const choose = (category, kind, allowRecent = false) => {
      let options = candidates(category);
      if (!allowRecent) options = recent.preferNotLatest(options);
      return options.sort((a, b) => score(b, kind) - score(a, kind))[0];
    };

    const unavailable = [];
    add(KEEP_SHOCHU_FEE, '焼酎キープの固定割代');
    if (p.drink !== 'none') {
      const selectedDrink = state.menu.find(item => item.id === p.drink && item.category === 'drink');
      if (!selectedDrink) unavailable.push('選択した飲み物がメニューに登録されていないため、入れられませんでした。');
      else if (excluded.has(selectedDrink.id)) unavailable.push(`選択した飲み物「${selectedDrink.name}」は品切れとして除外しました。`);
      else add(selectedDrink, '最初の飲み物として指定');
    }
    if (p.mustShishito) {
      const shishito = findByName('ししとう串') || state.menu.find(item => /ししとう/.test(item.name) || hasTag(item, 'shishito'));
      if (!shishito) unavailable.push('ししとうがメニューに登録されていないため、入れられませんでした。');
      else if (excluded.has(shishito.id)) unavailable.push('ししとうは品切れとして除外しました。');
      else add(shishito, '必須指定された串');
    }

    while (selected.filter(item => item.category === 'skewer').length < p.skewerCount) {
      const skewer = choose('skewer', 'skewer');
      if (!skewer) break;
      add(skewer, `指定された串 ${p.skewerCount}本を優先`);
    }
    if (p.wantFinish) {
      const finish = choose('finish', 'finish');
      add(finish, '「締めを入れる」の指定を優先');
    }

    const basePlan = p.hunger === 'light' ? ['small'] : p.hunger === 'normal' ? ['small'] : ['small', 'main'];
    basePlan.forEach(category => {
      const item = choose(category, category);
      add(item, reasonFor(item, category));
    });

    // If a category is unavailable, use the most suitable remaining dish.
    const baseCount = p.hunger === 'light' ? 1 : p.hunger === 'normal' ? 1 : 2;
    const minimum = 1 + (selected.some(item => item.category === 'drink') ? 1 : 0) + baseCount + p.skewerCount + (p.wantFinish ? 1 : 0);
    while (selected.length < minimum) {
      let fallbackOptions = candidates(null).filter(item => !['skewer', 'drink', 'dessert', 'fee'].includes(item.category) && (p.wantFinish || item.category !== 'finish'));
      fallbackOptions = recent.preferNotLatest(fallbackOptions);
      const fallback = fallbackOptions.sort((a, b) => score(b, 'fallback') - score(a, 'fallback'))[0];
      if (!fallback) break;
      add(fallback, reasonFor(fallback, 'fallback'));
    }
    selected.sort((a, b) => ({ drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 }[a.category] - { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 }[b.category]));
    const total = selected.reduce((sum, item) => sum + item.price, 0);
    const actualSkewerCount = selected.filter(item => item.category === 'skewer').length;
    if (actualSkewerCount < p.skewerCount) unavailable.push(`利用可能な串が不足しているため、希望の ${p.skewerCount}本に届かず ${actualSkewerCount}本までとなりました。`);
    if (p.wantFinish && !selected.some(item => item.category === 'finish')) unavailable.push('締めの候補が登録されていないか品切れのため、入れられませんでした。');
    const budgetMessage = budgetGuidance(selected, p.budget);
    if (budgetMessage) unavailable.unshift(budgetMessage);
    const excludedNames = state.menu.filter(item => excluded.has(item.id)).map(item => item.name);
    if (excludedNames.length) unavailable.unshift(`品切れとして除外中: ${excludedNames.join('・')}`);
    return { items: selected, total, budget: p.budget, unavailable, preferences: p, excludedIds: [...excluded] };
  }

  function replaceOutOfStockItems(order, checkedIds, excludedIds = getTodayOutOfStockIds()) {
    const targets = new Set(checkedIds.map(String));
    const excluded = new Set(excludedIds.map(String));
    const recent = recentOrderStats();
    const preferences = order.preferences;
    const usedIds = new Set(order.items.filter(item => !targets.has(String(item.id))).map(item => String(item.id)));
    const usedNames = new Set(order.items.filter(item => !targets.has(String(item.id))).map(item => item.name));
    const notices = order.unavailable.filter(message => !message.startsWith('品切れとして除外中:') && !message.startsWith('目安予算 '));
    let runningTotal = order.total;

    const replacementScore = (item, original) => {
      let value = item.category === original.category ? 8 : 0;
      if (preferences.moods.some(tag => hasTag(item, tag))) value += 5;
      value -= recent.penalty(item);
      if (item.category !== 'skewer' && preferences.hunger === 'light' && hasTag(item, 'light')) value += 1.7;
      if (item.category !== 'skewer' && preferences.hunger === 'hearty' && ['main', 'finish'].includes(item.category)) value += 1.5;
      value -= Math.abs(item.price - original.price) / 1000;
      return value + Math.random() * 0.8;
    };

    const findReplacement = (original) => {
      const available = state.menu.filter(item =>
        !excluded.has(String(item.id)) &&
        !usedIds.has(String(item.id)) &&
        !usedNames.has(item.name) &&
        item.category !== 'fee' &&
        (preferences.wantFinish || item.category !== 'finish')
      );
      const sameCategory = available.filter(item => item.category === original.category);
      let candidates = sameCategory;
      if (!candidates.length && !['drink', 'skewer', 'fee'].includes(original.category)) {
        candidates = available.filter(item => !['drink', 'skewer', 'fee'].includes(item.category));
      }
      candidates = recent.preferNotLatest(candidates);
      return candidates.sort((a, b) => replacementScore(b, original) - replacementScore(a, original))[0];
    };

    const items = [];
    order.items.forEach(item => {
      if (!targets.has(String(item.id))) {
        items.push(item);
        return;
      }

      const replacement = findReplacement(item);
      runningTotal -= item.price;
      if (!replacement) {
        notices.push(`品切れの「${item.name}」は代わりが見つからなかったため、この品だけ外しました。`);
        return;
      }

      items.push({ ...replacement, recommendationReason: `品切れの「${item.name}」と同じ分類から代替` });
      usedIds.add(String(replacement.id));
      usedNames.add(replacement.name);
      runningTotal += replacement.price;
      notices.push(`品切れの「${item.name}」を「${replacement.name}」に変更しました。`);
    });

    const excludedNames = state.menu.filter(item => excluded.has(String(item.id))).map(item => item.name);
    if (excludedNames.length) notices.unshift(`品切れとして除外中: ${excludedNames.join('・')}`);
    const budgetMessage = budgetGuidance(items, order.budget);
    if (budgetMessage) notices.unshift(budgetMessage);
    return { ...order, items, total: runningTotal, unavailable: notices, excludedIds: [...excluded] };
  }

  function regenerateOrderKeepingManualItems(order, preferences) {
    const manualItems = order?.items.filter(item => item.manuallyAdded) || [];
    const regenerated = createOrder(preferences);
    if (!manualItems.length) return regenerated;
    const priority = { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 };
    const items = [...regenerated.items, ...manualItems].sort((a, b) => priority[a.category] - priority[b.category]);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    return { ...regenerated, items, total };
  }

  function orderHeading(order) {
    const mood = order.preferences.moods.map(value => MOOD_LABEL[value] || TAG_LABEL[value] || value).join('・');
    const base = mood ? `${mood}気分のおすすめ` : order.preferences.hunger === 'light' ? '軽く一杯のおすすめ' : order.preferences.hunger === 'hearty' ? 'しっかり満足するおすすめ' : 'バランスのよいおすすめ';
    return `${base}（串 ${order.preferences.skewerCount}本）`;
  }

  function clearPendingReminderTimer() {
    if (pendingReminderTimer !== null) clearTimeout(pendingReminderTimer);
    pendingReminderTimer = null;
  }

  function schedulePendingReminder(savedAt = new Date().toISOString()) {
    clearPendingReminderTimer();
    if (!state.pendingOrder) return;
    const savedTime = new Date(savedAt).getTime();
    const elapsed = Number.isFinite(savedTime) ? Math.max(0, Date.now() - savedTime) : 0;
    const delay = Math.max(250, PENDING_REMINDER_MS - elapsed);
    pendingReminderTimer = setTimeout(() => {
      pendingReminderTimer = null;
      openPendingOrderDialog();
    }, delay);
  }

  function savePendingOrder(order, date = state.pendingOrder?.date || todayKey()) {
    if (!order?.items.length) return;
    const savedAt = new Date().toISOString();
    state.pendingOrder = normalizePendingOrder({ date, savedAt, order });
    saveState();
    schedulePendingReminder(savedAt);
  }

  function openPendingOrderDialog() {
    if (!state.pendingOrder) return;
    const { date, order } = state.pendingOrder;
    $('#pendingOrderDate').textContent = `${date}に作った注文案が、まだ注文履歴に記録されていません。`;
    $('#pendingOrderSummary').innerHTML = `<strong>${order.items.length}品・合計 ${yen(order.total)}</strong><span>${order.items.map(item => escapeHtml(item.name)).join('・')}</span>`;
    const dialog = $('#pendingOrderDialog');
    if (!dialog.open) dialog.showModal();
  }

  function restorePendingOrder() {
    if (!state.pendingOrder) return;
    currentOrder = state.pendingOrder.order;
    renderOrder(currentOrder, false);
    openPendingOrderDialog();
    schedulePendingReminder(state.pendingOrder.savedAt);
  }

  function inspectPendingOrder() {
    const dialog = $('#pendingOrderDialog');
    if (dialog.open) dialog.close();
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    schedulePendingReminder();
  }

  function discardPendingOrder() {
    state.pendingOrder = null;
    saveState();
    clearPendingReminderTimer();
    const dialog = $('#pendingOrderDialog');
    if (dialog.open) dialog.close();
    const button = $('#recordOrder');
    if (button) {
      button.textContent = '今回は記録しません';
      button.disabled = true;
      button.classList.remove('pending-record-button');
    }
  }

  function renderOrder(order, pendingMode = 'update') {
    if (pendingMode) savePendingOrder(order, pendingMode === 'new' ? todayKey() : undefined);
    const isEstimate = order.items.some(item => !item.actual);
    const recommendedTotal = order.items.filter(item => !item.manuallyAdded).reduce((sum, item) => sum + item.price, 0);
    const budgetDifference = recommendedTotal - order.budget;
    const budgetStatus = budgetDifference > 0 ? `目安超過 ${yen(budgetDifference)}` : `目安まで ${yen(-budgetDifference)}`;
    const list = order.items.length ? order.items.map((item, index) => {
      const moodMatches = order.preferences.moods.filter(tag => hasTag(item, tag));
      const moodMark = moodMatches.length ? '<span class="mood-match">★ 気分に合う</span>' : '';
      const reason = item.recommendationReason ? `<small class="recommendation-reason">理由: ${escapeHtml(item.recommendationReason)}</small>` : '';
      const stockControl = item.category === 'fee' ? '' : `<label class="out-of-stock"><input class="out-of-stock-check" type="checkbox" data-item-id="${escapeHtml(item.id)}" /> 品切れ</label>`;
      return `<li class="order-item"><span class="order-number">${index + 1}</span><div class="order-details"><strong>${escapeHtml(item.name)}${moodMark}</strong><small>${CATEGORY_LABEL[item.category]}</small>${reason}</div><span class="order-price">${yen(item.price)}</span>${stockControl}</li>`;
    }).join('') : '<li class="order-item"><div class="order-details"><strong>この条件ではメニューを組めませんでした</strong><small>メニュー登録や品切れ状況を確認してください。</small></div></li>';
    const unavailable = order.unavailable.length ? `<p class="notice">${order.unavailable.map(escapeHtml).join('<br>')}</p>` : '';
    $('#result').innerHTML = `<article class="result-card"><div class="result-top"><p>頼む順番まで、このままどうぞ</p><h2>${orderHeading(order)}</h2><div class="price-summary"><strong>${yen(order.total)}</strong><small>目安 ${yen(order.budget)}<br>${budgetStatus}${isEstimate ? '（価格は目安）' : ''}</small></div></div><ol class="order-list">${list}</ol>${unavailable}<div class="result-actions"><button class="secondary-button" type="button" id="regenerate">組み直す</button><button class="secondary-button" type="button" id="reconsiderOutOfStock" disabled>品切れを除いて組み直す</button><button class="secondary-button" type="button" id="addFromMenu">メニューから追加</button><button class="primary-button pending-record-button" type="button" id="recordOrder">この注文を記録</button></div></article>`;
    const reconsiderButton = $('#reconsiderOutOfStock');
    const stockChecks = $$('.out-of-stock-check');
    stockChecks.forEach(check => check.addEventListener('change', () => { reconsiderButton.disabled = !stockChecks.some(input => input.checked); }));
    reconsiderButton.addEventListener('click', () => {
      const checkedIds = stockChecks.filter(input => input.checked).map(input => input.dataset.itemId);
      const excludedIds = markOutOfStock(checkedIds);
      currentOrder = replaceOutOfStockItems(currentOrder, checkedIds, excludedIds);
      renderOrder(currentOrder);
    });
    $('#regenerate').addEventListener('click', () => { currentOrder = regenerateOrderKeepingManualItems(currentOrder, readPreferences()); renderOrder(currentOrder); });
    $('#addFromMenu').addEventListener('click', openAddToOrderDialog);
    $('#recordOrder').addEventListener('click', recordCurrentOrder);
  }

  function recordCurrentOrder() {
    if (!currentOrder?.items.length) return;
    const orderDate = state.pendingOrder?.date || todayKey();
    state.history.push({ id: uid(), date: orderDate, items: currentOrder.items.map(item => ({ name: item.name, price: item.price })) });
    state.history = state.history.slice(-100);
    state.pendingOrder = null;
    saveState();
    clearPendingReminderTimer();
    const dialog = $('#pendingOrderDialog');
    if (dialog.open) dialog.close();
    renderHistorySummary();
    const button = $('#recordOrder');
    if (button) {
      button.textContent = '記録しました ✓';
      button.disabled = true;
      button.classList.remove('pending-record-button');
    }
  }

  function openAddToOrderDialog() {
    if (!currentOrder) return;
    const excludedIds = new Set(getTodayOutOfStockIds());
    const choices = state.menu.filter(item => !excludedIds.has(item.id));
    const select = $('#additionalItem');
    select.replaceChildren(...choices.map(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name}（${yen(item.price)}）`;
      return option;
    }));
    $('#addOrderStatus').textContent = choices.length ? '追加額は注文合計にのみ反映されます。' : '追加できる商品がありません。';
    $('#confirmOrderAddition').disabled = choices.length === 0;
    $('#addToOrderDialog').showModal();
  }

  function addItemToCurrentOrder(event) {
    event.preventDefault();
    if (!currentOrder) return;
    const item = state.menu.find(menuItem => menuItem.id === $('#additionalItem').value);
    if (!item || getTodayOutOfStockIds().includes(item.id)) { $('#addOrderStatus').textContent = 'この商品は品切れのため追加できません。'; return; }
    const priority = { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 };
    const manuallyAddedItem = { ...item, manuallyAdded: true, recommendationReason: 'メニューから手動で追加' };
    const items = [...currentOrder.items, manuallyAddedItem].sort((a, b) => priority[a.category] - priority[b.category]);
    currentOrder = { ...currentOrder, items, total: currentOrder.total + manuallyAddedItem.price };
    $('#addToOrderDialog').close();
    renderOrder(currentOrder);
  }

  function renderHistorySummary() {
    const history = sortedHistory();
    if (!history.length) { $('#historySummary').innerHTML = '<h2>注文履歴</h2><p>まだ履歴はありません。注文を記録すると、次回は食べたばかりの料理を避けられます。</p>'; return; }
    const latest = history[0];
    $('#historySummary').innerHTML = `<h2>前回の注文 <span>(${escapeHtml(latest.date)})</span></h2><p>${latest.items.map(item => escapeHtml(item.name)).join('・')}</p><button class="text-button history-open-button" type="button" id="viewHistory">すべての履歴を見る（${history.length}件）</button>`;
    $('#viewHistory').addEventListener('click', openHistoryDialog);
  }

  function openHistoryDialog() {
    const history = sortedHistory();
    const list = $('#historyList');
    if (!history.length) {
      list.innerHTML = '<p class="history-empty">まだ注文履歴はありません。</p>';
    } else {
      list.innerHTML = history.map((entry, index) => {
        const hasPrices = entry.items.length > 0 && entry.items.every(item => Number.isFinite(Number(item.price)));
        const total = hasPrices ? entry.items.reduce((sum, item) => sum + Number(item.price), 0) : null;
        const summary = `${entry.items.length}品・${hasPrices ? `合計 ${yen(total)}` : '金額記録なし'}`;
        const items = entry.items.map(item => {
          const price = Number.isFinite(Number(item.price)) ? `<span>${yen(Number(item.price))}</span>` : '';
          return `<li>${escapeHtml(item.name)}${price}</li>`;
        }).join('');
        return `<article class="history-entry"><div class="history-entry-header"><strong>${escapeHtml(entry.date)}${index === 0 ? '（前回）' : ''}</strong><span>${summary}</span></div><ol>${items}</ol></article>`;
      }).join('');
    }
    $('#historyDialog').showModal();
  }

  function openDataDialog() { renderMenuEditor(); $('#dataDialog').showModal(); }
  function renderMenuEditor() {
    $('#menuCount').textContent = `${state.menu.length}品`;
    const editor = $('#menuEditor');
    editor.innerHTML = '';
    const template = $('#menuRowTemplate');
    state.menu.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'ja')).forEach(item => {
      const row = template.content.cloneNode(true);
      $('.menu-name', row).textContent = item.name;
      $('.menu-meta', row).textContent = `${yen(item.price)} ・ ${CATEGORY_LABEL[item.category]}${item.actual ? '' : ' ・ 目安'}`;
      $('.edit-menu-item', row).addEventListener('click', () => openMenuForm(item));
      $('.delete-menu-item', row).addEventListener('click', () => deleteMenuItem(item));
      editor.append(row);
    });
  }

  function openMenuForm(item) {
    $('#menuFormTitle').textContent = item ? 'メニューを編集' : 'メニューを追加';
    $('#itemId').value = item?.id || '';
    $('#itemName').value = item?.name || '';
    $('#itemPrice').value = item?.price ?? '';
    $('#itemCategory').value = item?.category || 'small';
    $('#itemTags').value = item?.tags.join('|') || '';
    $('#itemActual').checked = item?.actual || false;
    $('#menuItemDialog').showModal();
    $('#itemName').focus();
  }
  function saveMenuItem(event) {
    event.preventDefault();
    const item = normalizeMenuItem({ id: $('#itemId').value || uid(), name: $('#itemName').value, price: $('#itemPrice').value, category: $('#itemCategory').value, tags: $('#itemTags').value, actual: $('#itemActual').checked });
    if (!item) return;
    const index = state.menu.findIndex(menuItem => menuItem.id === item.id);
    if (index >= 0) state.menu[index] = item; else state.menu.push(item);
    saveState(); renderMenuEditor(); renderDrinkOptions(); renderMoodChoices(); $('#menuItemDialog').close();
  }
  function deleteMenuItem(item) {
    if (!confirm(`「${item.name}」をメニューから削除しますか？`)) return;
    state.menu = state.menu.filter(menuItem => menuItem.id !== item.id);
    saveState(); renderMenuEditor(); renderDrinkOptions(); renderMoodChoices();
  }

  async function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const status = $('#importStatus');
    try {
      const text = await file.text();
      const data = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
      const requestedTarget = $('#importTarget').value;
      const mode = $('input[name="importMode"]:checked').value;
      const result = mergeImportedData(data, requestedTarget, mode);
      saveState(); renderMenuEditor(); renderDrinkOptions(); renderMoodChoices(); renderHistorySummary();
      status.textContent = `${result}を読み込みました。`;
    } catch (error) { status.textContent = `読み込めませんでした: ${error.message}`; }
    event.target.value = '';
  }

  function parseCsv(text) {
    const rows = []; let row = []; let value = ''; let quoted = false;
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < normalized.length; i += 1) {
      const char = normalized[i];
      if (char === '"' && quoted && normalized[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(value); value = ''; }
      else if (char === '\n' && !quoted) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; }
      else value += char;
    }
    row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
    if (rows.length < 2) throw new Error('見出しと1行以上のデータが必要です');
    return rows.slice(1).map(rowValues => Object.fromEntries(rows[0].map((heading, index) => [heading.trim(), rowValues[index]?.trim() || ''])));
  }

  function mergeImportedData(data, requestedTarget, mode) {
    const isBundle = !Array.isArray(data) && data && (Array.isArray(data.menu) || Array.isArray(data.history));
    const rows = Array.isArray(data) ? data : (isBundle ? [] : [data]);
    const hasMenuFields = rows.some(item => item.name || item['料理名'] || item['メニュー名'] || item.price || item['価格']);
    const target = requestedTarget === 'auto' ? (isBundle ? 'bundle' : hasMenuFields ? 'menu' : 'history') : requestedTarget;
    let importedMenu = 0; let importedHistory = 0;
    const putMenu = entries => {
      const valid = entries.map(normalizeMenuItem).filter(Boolean);
      importedMenu += valid.length;
      if (!valid.length) throw new Error('メニューとして使える「料理名」と「価格」が見つかりません');
      if (mode === 'replace') state.menu = [];
      valid.forEach(item => { const index = state.menu.findIndex(existing => existing.name === item.name); if (index >= 0) state.menu[index] = { ...state.menu[index], ...item, id: state.menu[index].id }; else state.menu.push(item); });
    };
    const putHistory = entries => {
      const valid = entries.map(normalizeHistoryItem).filter(Boolean);
      importedHistory += valid.length;
      if (!valid.length) throw new Error('履歴として使える「日付」と「注文」が見つかりません');
      if (mode === 'replace') state.history = [];
      valid.forEach(item => { const index = state.history.findIndex(existing => existing.date === item.date && existing.items.map(i => i.name).join('|') === item.items.map(i => i.name).join('|')); if (index < 0) state.history.push(item); });
    };
    if (target === 'bundle') { if (Array.isArray(data.menu)) putMenu(data.menu); if (Array.isArray(data.history)) putHistory(data.history); }
    else if (target === 'menu') putMenu(Array.isArray(data?.menu) ? data.menu : rows);
    else putHistory(Array.isArray(data?.history) ? data.history : rows);
    const parts = []; if (target === 'menu' || target === 'bundle') parts.push(`メニュー ${importedMenu}件`); if (target === 'history' || target === 'bundle') parts.push(`履歴 ${importedHistory}件`); return parts.join('、');
  }

  function createFullBackupPayload() {
    return {
      format: FULL_BACKUP_FORMAT,
      schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      source: { app: '日高オーダー', storageKey: STORAGE_KEY },
      data: JSON.parse(JSON.stringify(state))
    };
  }

  function normalizeFullBackup(raw) {
    if (!raw || raw.format !== FULL_BACKUP_FORMAT) throw new Error('日高オーダーの完全バックアップではありません');
    if (Number(raw.schemaVersion) !== FULL_BACKUP_SCHEMA_VERSION) throw new Error(`未対応のバックアップ形式です（バージョン ${raw.schemaVersion ?? '不明'}）`);
    const saved = raw.data;
    if (!saved || !Array.isArray(saved.menu) || !Array.isArray(saved.initialMenu) || !Array.isArray(saved.history)) throw new Error('バックアップに必要なデータが不足しています');
    const base = defaultState();
    const menu = saved.menu.map(normalizeMenuItem).filter(Boolean);
    const initialMenu = saved.initialMenu.map(normalizeMenuItem).filter(Boolean);
    const history = saved.history.map(normalizeHistoryItem).filter(Boolean);
    if (menu.length !== saved.menu.length || initialMenu.length !== saved.initialMenu.length || history.length !== saved.history.length) throw new Error('壊れているメニューまたは注文履歴が含まれています');
    const preferences = { ...base.preferences, ...(saved.preferences || {}), budget: ORDER_BUDGET, avoidRecent: true };
    preferences.moods = Array.isArray(preferences.moods) ? preferences.moods.map(String) : [];
    preferences.skewerCount = Math.max(0, Math.min(10, Math.round(Number(preferences.skewerCount) || 0)));
    const outOfStock = saved.outOfStock && typeof saved.outOfStock.date === 'string' && Array.isArray(saved.outOfStock.ids)
      ? { date: saved.outOfStock.date, ids: saved.outOfStock.ids.map(String) }
      : base.outOfStock;
    const pendingOrder = normalizePendingOrder(saved.pendingOrder);
    if (saved.pendingOrder && !pendingOrder) throw new Error('未記録注文のデータが壊れています');
    const exportedAt = String(raw.exportedAt || '');
    return {
      exportedAt: Number.isFinite(new Date(exportedAt).getTime()) ? exportedAt : '',
      state: { ...base, defaultMenuVersion: activeDefaultMenuVersion, menu, initialMenu, history, preferences, outOfStock, pendingOrder }
    };
  }

  function downloadFullBackup() {
    const payload = createFullBackupPayload();
    download(`日高オーダー_全データ_${todayKey()}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8', false);
    $('#fullBackupStatus').textContent = `メニュー ${state.menu.length}品・履歴 ${state.history.length}件を保存しました。`;
  }

  async function restoreFullBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const status = $('#fullBackupStatus');
    try {
      const restored = normalizeFullBackup(JSON.parse(await file.text()));
      const backupState = restored.state;
      const exportedAt = restored.exportedAt ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(restored.exportedAt)) : '日時不明';
      const message = [
        `バックアップ日時: ${exportedAt}`,
        `現在: メニュー ${state.menu.length}品・履歴 ${state.history.length}件`,
        `復元後: メニュー ${backupState.menu.length}品・履歴 ${backupState.history.length}件`,
        `未記録注文: ${backupState.pendingOrder ? 'あり' : 'なし'}`,
        '',
        '現在の端末データを上書きして復元しますか？'
      ].join('\n');
      if (!confirm(message)) { status.textContent = '復元をキャンセルしました。'; return; }
      clearPendingReminderTimer();
      state = backupState;
      currentOrder = state.pendingOrder?.order || null;
      getTodayOutOfStockIds();
      saveState();
      renderMoodChoices();
      applyPreferences();
      renderMenuEditor();
      renderHistorySummary();
      if (currentOrder) {
        renderOrder(currentOrder, false);
        schedulePendingReminder();
      } else {
        $('#result').innerHTML = '<div class="empty-state"><span class="empty-illustration">🍢</span><h2>条件を選んで注文案を作ろう</h2><p>空腹度・気分から、バランスよく選びます。</p></div>';
      }
      status.textContent = `メニュー ${state.menu.length}品・履歴 ${state.history.length}件を復元しました。`;
    } catch (error) {
      status.textContent = `復元できませんでした: ${error.message}`;
    } finally {
      event.target.value = '';
    }
  }

  function download(filename, content, mimeType = 'text/csv;charset=utf-8', includeBom = true) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([includeBom ? `\uFEFF${content}` : content], { type: mimeType }));
    link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadCurrentMenuBackup() {
    const rows = [
      ['料理名', '価格', '分類', 'タグ', '実額'],
      ...state.menu.map(item => [item.name, item.price, item.category, item.tags.join('|'), item.actual])
    ];
    const csv = `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`;
    download(`やきとり日高_メニューバックアップ_${todayKey()}.csv`, csv);
    $('#importStatus').textContent = `現在のメニュー ${state.menu.length}品をCSVに保存しました。`;
  }
  async function downloadDefaultMenu() {
    try {
      const response = await fetch('./data/hidaka-menu.csv', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      download('やきとり日高_メニュー.csv', await response.text());
    } catch (error) {
      $('#importStatus').textContent = `基本メニューCSVを保存できませんでした: ${error.message}`;
    }
  }
  function resetData() {
    if (!confirm('メニューを登録済みの初期メニューへ戻し、注文履歴と設定を初期化しますか？')) return;
    clearPendingReminderTimer();
    const base = defaultState();
    const initialMenu = cloneMenu(state.initialMenu?.length ? state.initialMenu : base.initialMenu);
    state = { ...base, menu: initialMenu, initialMenu: cloneMenu(initialMenu) }; currentOrder = null; saveState(); renderMoodChoices(); applyPreferences(); renderMenuEditor(); renderHistorySummary();
    $('#dataDialog').close();
    $('#result').innerHTML = '<div class="empty-state"><span class="empty-illustration">🍢</span><h2>条件を選んで注文案を作ろう</h2><p>空腹度・気分から、バランスよく選びます。</p></div>';
  }

  function registerInitialMenu() {
    if (!state.menu.length) { $('#initialDataStatus').textContent = 'メニューが空のため登録できません。'; return; }
    if (!confirm('現在のメニューを、今後の初期メニューとして登録しますか？')) return;
    state.initialMenu = cloneMenu(state.menu);
    saveState();
    $('#initialDataStatus').textContent = `${state.initialMenu.length}品を初期メニューとして登録しました。`;
  }

  let deferredInstallPrompt = null;

  function setupInstallPrompt() {
    const installButton = $('#installButton');
    if (!installButton) return;

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      installButton.hidden = true;
      return;
    }

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });

    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(error => {
        console.warn('Service Workerを登録できませんでした。', error);
      });
    });
  }

  async function boot() {
    const loadedDefault = await loadDefaultMenu();
    defaultMenu = loadedDefault.menu;
    activeDefaultMenuVersion = loadedDefault.version;
    state = loadState();
    init();
    setupInstallPrompt();
    registerServiceWorker();
  }

  boot();
})();
