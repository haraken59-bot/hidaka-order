(() => {
  'use strict';

  const STORAGE_KEY = 'hidaka-order-v1';
  const FULL_BACKUP_FORMAT = 'hidaka-order-full-backup';
  const FULL_BACKUP_SCHEMA_VERSION = 6;
  const MIN_SUPPORTED_BACKUP_SCHEMA_VERSION = 1;
  const DATA_SCHEMA_VERSION = 6;
  const APP_VERSION = '1.15.2';
  const DEFAULT_MENU_VERSION = 'hidaka-menu-2026-08-31-v1';
  const MENU_DATA_UPDATED_AT = '2026-09-01';
  const FALLBACK_MENU_VERSION = 'fallback-menu-v1';
  const DEFAULT_STORE_ID = 'hidaka-001';
  const FALLBACK_STORE = { id: DEFAULT_STORE_ID, name: 'やきとり日高', area: '', memo: '' };
  const CATEGORY_LABEL = { drink: 'お酒', small: '小皿・つまみ', skewer: '串', main: '一品', finish: '締め', dessert: 'デザート', fee: '割代' };
  const OFFERING_TYPE_LABEL = { regular: '通常', seasonal: '季節', limited: '期間限定' };
  const SEASON_LABEL = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const SEASON_CANONICAL = { spring: 'spring', '春': 'spring', summer: 'summer', '夏': 'summer', autumn: 'autumn', fall: 'autumn', '秋': 'autumn', winter: 'winter', '冬': 'winter' };
  const MOOD_LABEL = { pork: '豚', chicken: '鶏', seafood: '魚介', vegetable: '野菜', spicy: '辛いもの' };
  const TAG_LABEL = { pork: '豚', chicken: '鶏', beef: '牛', seafood: '魚介', vegetable: '野菜', spicy: '辛いもの', light: '軽め', drink: '飲み物', finish: '締め', rice: 'ご飯', noodle: '麺', soup: '汁物', dessert: 'デザート', sweet: '甘いもの', alcohol: 'アルコール', nonalcohol: 'ノンアルコール', shishito: 'ししとう' };
  const TAG_CANONICAL = { pork: 'pork', '豚': 'pork', chicken: 'chicken', '鶏': 'chicken', beef: 'beef', '牛': 'beef', seafood: 'seafood', '魚介': 'seafood', vegetable: 'vegetable', '野菜': 'vegetable', spicy: 'spicy', '辛いもの': 'spicy', light: 'light', '軽め': 'light', drink: 'drink', '飲み物': 'drink', finish: 'finish', '締め': 'finish', rice: 'rice', 'ご飯': 'rice', noodle: 'noodle', '麺': 'noodle', soup: 'soup', '汁物': 'soup', dessert: 'dessert', 'デザート': 'dessert', sweet: 'sweet', '甘いもの': 'sweet', alcohol: 'alcohol', 'アルコール': 'alcohol', nonalcohol: 'nonalcohol', 'ノンアルコール': 'nonalcohol', shishito: 'shishito', 'ししとう': 'shishito' };
  const MENU_CATEGORY_OPTIONS = ['drink', 'small', 'skewer', 'main', 'finish', 'dessert'];
  const MENU_TAG_GROUPS = [
    { label: '食材', tags: ['pork', 'chicken', 'beef', 'seafood', 'vegetable'] },
    { label: '内容・用途', tags: ['drink', 'finish', 'rice', 'noodle', 'soup', 'dessert'] },
    { label: '特徴', tags: ['spicy', 'light', 'sweet', 'alcohol', 'nonalcohol', 'shishito'] }
  ];
  const MENU_TAG_SORT_ORDER = MENU_TAG_GROUPS.flatMap(group => group.tags);
  const FOOD_MOOD_TAGS = new Set(['pork', 'chicken', 'beef', 'seafood', 'vegetable', 'spicy']);
  const KEEP_SHOCHU_FEE = { id: 'keep-shochu-fee', storeId: DEFAULT_STORE_ID, name: '割代（焼酎キープ）', price: 220, category: 'fee', tags: [], actual: true };
  const ORDER_BUDGET = 3000;
  const HUNGER_LABEL = { light: '軽め', normal: '普通' };
  const HUNGER_DISH_COUNT = { light: 1, normal: 2 };
  const FIXED_SKEWER_COUNT = 5;
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
  let defaultStores = [FALLBACK_STORE];
  let activeDefaultMenuVersion = FALLBACK_MENU_VERSION;

  function cloneMenu(menu) { return menu.map(item => ({ ...item, tags: [...item.tags] })); }
  function cloneStores(stores) { return stores.map(store => ({ ...store })); }
  function normalizeHungerPreference(value) { return value === 'light' ? 'light' : 'normal'; }
  function defaultState() {
    const stores = cloneStores(defaultStores);
    const activeStoreId = stores.some(store => store.id === DEFAULT_STORE_ID) ? DEFAULT_STORE_ID : stores[0].id;
    const menu = defaultMenu.map(item => ({ ...item, storeId: item.storeId || activeStoreId, tags: item.tags.map(localizeTag) }));
    return { dataSchemaVersion: DATA_SCHEMA_VERSION, defaultMenuVersion: activeDefaultMenuVersion, stores, activeStoreId, menu, initialMenu: cloneMenu(menu), history: [], preferences: { budget: ORDER_BUDGET, hunger: 'normal', selectedDishId: '', featuredDishId: '', featuredDishDate: '', includeFeaturedDish: false, skewerCount: FIXED_SKEWER_COUNT, drink: 'highball', moods: [], mustShishito: true, wantFinish: false, avoidRecent: true }, menuSortMode: 'tag', outOfStock: { date: todayKey(), ids: [] }, pendingOrder: null };
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
      const savedStores = normalizeStores(saved.stores);
      const stores = savedStores.length ? savedStores : base.stores;
      const requestedStoreId = String(saved.activeStoreId || base.activeStoreId);
      const activeStoreId = stores.some(store => store.id === requestedStoreId) ? requestedStoreId : base.activeStoreId;
      const outOfStock = saved.outOfStock && typeof saved.outOfStock.date === 'string' && Array.isArray(saved.outOfStock.ids) ? { date: saved.outOfStock.date, ids: saved.outOfStock.ids.map(String) } : base.outOfStock;
      const shouldInstallNewBaseMenu = saved.defaultMenuVersion !== activeDefaultMenuVersion;
      const menu = shouldInstallNewBaseMenu ? cloneMenu(base.menu) : saved.menu.map(normalizeMenuItem).filter(Boolean);
      const initialMenu = shouldInstallNewBaseMenu ? cloneMenu(base.initialMenu) : (Array.isArray(saved.initialMenu) ? saved.initialMenu.map(normalizeMenuItem).filter(Boolean) : cloneMenu(menu));
      const menuSortMode = ['tag', 'category'].includes(saved.menuSortMode) ? saved.menuSortMode : base.menuSortMode;
      const preferences = { ...base.preferences, ...(saved.preferences || {}), avoidRecent: true };
      preferences.hunger = normalizeHungerPreference(preferences.hunger);
      preferences.selectedDishId = '';
      preferences.featuredDishId = String(preferences.featuredDishId || '');
      preferences.featuredDishDate = String(preferences.featuredDishDate || '');
      preferences.includeFeaturedDish = preferences.featuredDishDate === todayKey() && preferences.includeFeaturedDish === true;
      preferences.skewerCount = FIXED_SKEWER_COUNT;
      preferences.mustShishito = true;
      preferences.wantFinish = false;
      return { ...base, ...saved, dataSchemaVersion: DATA_SCHEMA_VERSION, defaultMenuVersion: activeDefaultMenuVersion, stores, activeStoreId, preferences, menuSortMode, outOfStock, menu, initialMenu, history: saved.history.map(entry => normalizeHistoryItem(entry, menu)).filter(Boolean), pendingOrder: normalizePendingOrder(saved.pendingOrder) };
    } catch { return defaultState(); }
  }

  async function loadDefaultMenu() {
    try {
      const response = await fetch('./data/hidaka-menu.csv', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseCsv(await response.text());
      return { menu: normalizeDefaultMenuRows(rows), version: DEFAULT_MENU_VERSION };
    } catch (error) {
      console.warn('基本メニューCSVを読み込めないため、内蔵メニューを使います。', error);
      return { menu: fallbackMenu, version: FALLBACK_MENU_VERSION };
    }
  }

  async function loadDefaultStores() {
    try {
      const response = await fetch('./data/stores.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const stores = normalizeStores(await response.json());
      if (!stores.length) throw new Error('店舗情報が空です。');
      return stores;
    } catch (error) {
      console.warn('店舗情報を読み込めないため、内蔵の店舗情報を使います。', error);
      return [FALLBACK_STORE];
    }
  }

  function normalizeDefaultMenuRows(rows) {
    const menu = rows.map((row, index) => normalizeMenuItem({ ...row, id: row['メニューID'] || row.ID || `base-${String(index + 1).padStart(3, '0')}` })).filter(Boolean);
    if (!menu.length) throw new Error('基本メニューが空です。');
    if (new Set(menu.map(item => item.id)).size !== menu.length) throw new Error('基本メニューのメニューIDが重複しています。');
    return menu;
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
  function uid(prefix = 'item') { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function normalizeStore(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? raw.storeId ?? raw['店舗ID'] ?? '').trim();
    const name = String(raw.name ?? raw['店名'] ?? raw['店舗名'] ?? '').trim();
    if (!id || !name) return null;
    return { id, name, area: String(raw.area ?? raw['エリア'] ?? '').trim(), memo: String(raw.memo ?? raw['メモ'] ?? '').trim() };
  }
  function normalizeStores(raw) {
    const rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.stores) ? raw.stores : []);
    const stores = rows.map(normalizeStore).filter(Boolean);
    return new Set(stores.map(store => store.id)).size === stores.length ? stores : [];
  }
  function getActiveStoreId() { return state?.activeStoreId || DEFAULT_STORE_ID; }
  function getActiveStore() { return state?.stores?.find(store => store.id === getActiveStoreId()) || FALLBACK_STORE; }
  function canonicalTag(tag) { return TAG_CANONICAL[String(tag || '').trim().toLowerCase()] || String(tag || '').trim().toLowerCase(); }
  function localizeTag(tag) { const original = String(tag || '').trim(); return TAG_LABEL[canonicalTag(original)] || original; }
  function hasTag(item, target) { return item.tags.some(tag => canonicalTag(tag) === canonicalTag(target)); }
  function isMenuManuallyAvailable(item) { return item?.available !== false; }
  function isMenuWithinOfferingPeriod(item, date = todayKey()) {
    if (item?.availableFrom && date < item.availableFrom) return false;
    if (item?.availableUntil && date > item.availableUntil) return false;
    return true;
  }
  function isMenuAvailable(item) { return isMenuManuallyAvailable(item) && isMenuWithinOfferingPeriod(item); }
  function hasAvailabilityField(raw) { return raw && ['available', '提供中', '提供状態'].some(key => Object.prototype.hasOwnProperty.call(raw, key)); }
  function hasOfferingFields(raw) { return raw && ['offeringType', '提供区分', 'seasons', '季節', 'availableFrom', '提供開始日', 'availableUntil', '提供終了日', 'memo', 'メモ', 'updatedAt', '最終更新日'].some(key => Object.prototype.hasOwnProperty.call(raw, key)); }
  function normalizeAvailability(raw) {
    const value = raw.available ?? raw['提供中'] ?? raw['提供状態'];
    if (value === undefined || value === null || value === '') return true;
    if (value === false) return false;
    return !['false', '0', '休止', '休止中', '停止', '提供休止'].includes(String(value).trim().toLowerCase());
  }
  function normalizeTags(tags) {
    const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(/[|,、]/);
    return rawTags.map(localizeTag).filter(Boolean);
  }
  function normalizeOfferingType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const aliases = { '通常': 'regular', '通常メニュー': 'regular', '季節': 'seasonal', '季節メニュー': 'seasonal', '期間限定': 'limited', '期間限定メニュー': 'limited' };
    return OFFERING_TYPE_LABEL[normalized] ? normalized : (aliases[normalized] || 'regular');
  }
  function normalizeSeasons(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(/[|,、]/);
    return [...new Set(values.map(season => SEASON_CANONICAL[String(season).trim().toLowerCase()]).filter(Boolean))];
  }
  function normalizeOptionalDate(value) {
    const normalized = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
  }
  function normalizeMenuItem(raw) {
    const name = String(raw.name ?? raw['料理名'] ?? raw['メニュー名'] ?? '').trim();
    const price = Number(raw.price ?? raw['価格'] ?? raw['値段']);
    if (!name || !Number.isFinite(price) || price < 0) return null;
    const categoryValue = String(raw.category ?? raw['分類'] ?? 'small').toLowerCase();
    const categoryMap = { 'お酒': 'drink', '飲み物': 'drink', '小皿': 'small', '小皿・つまみ': 'small', 'つまみ': 'small', '串': 'skewer', '焼き鳥': 'skewer', '一品': 'main', '主菜': 'main', '締め': 'finish', 'ご飯': 'finish', 'デザート': 'dessert', '甘味': 'dessert' };
    const category = CATEGORY_LABEL[categoryValue] ? categoryValue : (categoryMap[categoryValue] || 'small');
    const actualValue = raw.actual ?? raw['実額'] ?? raw['実売価格'];
    const storeId = String(raw.storeId ?? raw['店舗ID'] ?? DEFAULT_STORE_ID).trim() || DEFAULT_STORE_ID;
    const offeringType = normalizeOfferingType(raw.offeringType ?? raw['提供区分']);
    const seasons = offeringType === 'seasonal' ? normalizeSeasons(raw.seasons ?? raw['季節']) : [];
    const availableFrom = offeringType === 'regular' ? '' : normalizeOptionalDate(raw.availableFrom ?? raw['提供開始日']);
    const availableUntil = offeringType === 'regular' ? '' : normalizeOptionalDate(raw.availableUntil ?? raw['提供終了日']);
    const memo = String(raw.memo ?? raw['メモ'] ?? '').trim();
    const updatedAt = String(raw.updatedAt ?? raw['最終更新日'] ?? '').trim();
    return { id: String(raw.id || raw['ID'] || raw['メニューID'] || uid()), storeId, name, price: Math.round(price), category, tags: normalizeTags(raw.tags ?? raw['タグ']), actual: actualValue === true || String(actualValue).toLowerCase() === 'true' || String(actualValue) === '1', available: normalizeAvailability(raw), offeringType, seasons, availableFrom, availableUntil, memo, updatedAt };
  }
  function normalizeSuggestedItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name ?? raw['メニュー名'] ?? '').trim();
    if (!name) return null;
    const priceValue = raw.price ?? raw.unitPrice ?? raw['提案時価格'];
    const price = priceValue !== null && priceValue !== undefined && priceValue !== '' && Number.isFinite(Number(priceValue)) ? Math.round(Number(priceValue)) : null;
    return {
      menuId: String(raw.menuId ?? raw.id ?? raw['メニューID'] ?? '').trim(),
      name,
      price,
      category: String(raw.category ?? raw['分類'] ?? '').trim(),
      recommendationReason: String(raw.recommendationReason ?? raw['選定理由'] ?? '').trim()
    };
  }
  function historyUnitPrice(item) {
    const value = item?.unitPrice ?? item?.price;
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
  }
  function normalizeHistoryLine(raw, index, historyId, storeId, menu) {
    const source = typeof raw === 'string' ? { name: raw } : (raw && typeof raw === 'object' ? raw : {});
    const name = String(source.name ?? source['料理名'] ?? source['メニュー名'] ?? '').trim();
    if (!name) return null;
    const menuMatch = menu.find(item => item.storeId === storeId && historyNameKey(item.name) === historyNameKey(name))
      || menu.find(item => historyNameKey(item.name) === historyNameKey(name));
    const menuId = String(source.menuId ?? source['メニューID'] ?? menuMatch?.id ?? '').trim();
    const orderIndexValue = Number(source.orderIndex ?? source['注文順'] ?? index + 1);
    const orderIndex = Number.isFinite(orderIndexValue) && orderIndexValue > 0 ? Math.round(orderIndexValue) : index + 1;
    const quantityValue = Number(source.quantity ?? source['数量'] ?? 1);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : 1;
    const rawPrice = source.unitPrice ?? source.price ?? source['注文時価格'] ?? source['価格'];
    const unitPrice = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice)) && Number(rawPrice) >= 0 ? Math.round(Number(rawPrice)) : null;
    const sourceValue = String(source.source ?? source['追加区分'] ?? (source.manuallyAdded ? 'manual' : 'legacy')).toLowerCase();
    const selectionSource = ['recommended', 'manual', 'changed', 'fixed', 'legacy'].includes(sourceValue) ? sourceValue : 'legacy';
    const recommendationReason = String(source.recommendationReason ?? source['選定理由'] ?? '').trim();
    const aiSuggestion = normalizeSuggestedItem(source.aiSuggestion ?? source['AI提案']);
    const changeReason = String(source.changeReason ?? source['変更理由'] ?? '').trim();
    return {
      lineId: String(source.lineId ?? source['注文明細ID'] ?? `${historyId}-line-${orderIndex}`),
      menuId,
      name,
      orderIndex,
      quantity,
      unitPrice,
      price: unitPrice,
      subtotal: unitPrice === null ? null : unitPrice * quantity,
      source: selectionSource,
      ...(recommendationReason ? { recommendationReason } : {}),
      ...(aiSuggestion ? { aiSuggestion } : {}),
      ...(changeReason ? { changeReason } : {})
    };
  }
  function normalizeBooleanOrNull(value) {
    if (value === true || value === false) return value;
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'はい', 'あり', '利用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'いいえ', 'なし', '未利用'].includes(normalized)) return false;
    return null;
  }
  function normalizeFeedback(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const satisfactionValue = Number(source.satisfaction ?? source['満足度']);
    const satisfaction = Number.isInteger(satisfactionValue) && satisfactionValue >= 1 && satisfactionValue <= 5 ? satisfactionValue : null;
    const repeatValue = String(source.repeatPreference ?? source['次回意向'] ?? '').trim().toLowerCase();
    let repeatPreference = ['again', 'avoid', 'none'].includes(repeatValue) ? repeatValue : '';
    if (!repeatPreference) {
      const wouldOrderAgain = normalizeBooleanOrNull(source.wouldOrderAgain ?? source['また頼みたい']);
      const avoidNextTime = normalizeBooleanOrNull(source.avoidNextTime ?? source['次回は避けたい']);
      repeatPreference = wouldOrderAgain === true ? 'again' : (avoidNextTime === true ? 'avoid' : (wouldOrderAgain === false || avoidNextTime === false ? 'none' : ''));
    }
    const amountValue = String(source.amount ?? source['量'] ?? '').trim().toLowerCase();
    const amountMap = { '少ない': 'small', 'ちょうどよい': 'just', 'ちょうど良い': 'just', '多い': 'large' };
    const amount = ['small', 'just', 'large'].includes(amountValue) ? amountValue : (amountMap[amountValue] || '');
    const priceValue = String(source.priceFeeling ?? source['金額感'] ?? '').trim().toLowerCase();
    const priceMap = { '安い': 'cheap', '適切': 'fair', '高い': 'expensive' };
    const priceFeeling = ['cheap', 'fair', 'expensive'].includes(priceValue) ? priceValue : (priceMap[priceValue] || '');
    const updatedAtValue = String(source.updatedAt ?? source['更新日時'] ?? '').trim();
    return {
      satisfaction,
      repeatPreference,
      wouldOrderAgain: repeatPreference ? repeatPreference === 'again' : null,
      avoidNextTime: repeatPreference ? repeatPreference === 'avoid' : null,
      amount,
      priceFeeling,
      comment: String(source.comment ?? source['コメント'] ?? '').trim().slice(0, 300),
      updatedAt: Number.isFinite(new Date(updatedAtValue).getTime()) ? updatedAtValue : ''
    };
  }
  function hasFeedback(feedback) {
    return Boolean(feedback && (feedback.satisfaction !== null || (feedback.repeatPreference && feedback.repeatPreference !== 'none') || feedback.amount || feedback.priceFeeling || feedback.comment));
  }
  function normalizeVisitContext(raw, menu = state?.menu || defaultMenu) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const budgetValue = source.budget ?? source['予算'];
    const budgetNumber = budgetValue === null || budgetValue === undefined || budgetValue === '' ? NaN : Number(budgetValue);
    const hungerValue = String(source.hunger ?? source['空腹度'] ?? '').trim().toLowerCase();
    const hungerMap = { '軽め': 'light', '普通': 'normal', 'しっかり': 'hearty', 'がっつり': 'hearty' };
    const hunger = ['light', 'normal', 'hearty'].includes(hungerValue) ? hungerValue : (hungerMap[hungerValue] || '');
    const skewerValue = source.skewerCount ?? source['串本数'];
    const skewerNumber = skewerValue === null || skewerValue === undefined || skewerValue === '' ? NaN : Number(skewerValue);
    const moodValue = source.moods ?? source['今日の気分'] ?? source['食べたいジャンル'];
    const moods = (Array.isArray(moodValue) ? moodValue : String(moodValue || '').split(/[|,、]/)).map(String).map(value => value.trim()).filter(Boolean);
    const startingDrinkId = String(source.startingDrinkId ?? source['開始飲み物ID'] ?? '').trim();
    const drinkMatch = startingDrinkId ? menu.find(item => item.id === startingDrinkId) : null;
    const startingDrinkName = String(source.startingDrinkName ?? source['最初の飲み物'] ?? drinkMatch?.name ?? '').trim();
    const stayDurationValue = source.stayDurationMinutes ?? source['滞在時間（分）'];
    const stayDurationNumber = stayDurationValue === null || stayDurationValue === undefined || stayDurationValue === '' ? NaN : Number(stayDurationValue);
    return {
      budget: Number.isFinite(budgetNumber) && budgetNumber >= 0 ? Math.round(budgetNumber) : null,
      hunger,
      skewerCount: Number.isFinite(skewerNumber) && skewerNumber >= 0 ? Math.round(skewerNumber) : null,
      moods,
      startingDrinkId,
      startingDrinkName,
      mustShishito: normalizeBooleanOrNull(source.mustShishito ?? source['ししとう必須']),
      wantFinish: normalizeBooleanOrNull(source.wantFinish ?? source['締め希望']),
      avoidRecent: normalizeBooleanOrNull(source.avoidRecent ?? source['最近の重複回避']),
      shochuKeepUsed: normalizeBooleanOrNull(source.shochuKeepUsed ?? source['焼酎キープ利用']),
      visitStage: String(source.visitStage ?? source['来店段階'] ?? '').trim(),
      plansSecondVenue: normalizeBooleanOrNull(source.plansSecondVenue ?? source['2軒目予定']),
      seafoodRequested: normalizeBooleanOrNull(source.seafoodRequested ?? source['魚介希望']),
      meatRequested: normalizeBooleanOrNull(source.meatRequested ?? source['肉希望']),
      seasonalRequested: normalizeBooleanOrNull(source.seasonalRequested ?? source['旬のもの希望']),
      stayDurationMinutes: Number.isFinite(stayDurationNumber) && stayDurationNumber >= 0 ? Math.round(stayDurationNumber) : null,
      otherWishes: String(source.otherWishes ?? source['その他の希望'] ?? '').trim()
    };
  }
  function createVisitContext(order) {
    const preferences = order?.preferences && typeof order.preferences === 'object' ? order.preferences : {};
    const selectedDrink = preferences.drink && preferences.drink !== 'none'
      ? order.items?.find(item => item.category === 'drink' && (item.id === preferences.drink || matchesSelectedDrink(item, preferences.drink)))
        || state.menu.find(item => item.category === 'drink' && (item.id === preferences.drink || matchesSelectedDrink(item, preferences.drink)))
      : null;
    return normalizeVisitContext({
      budget: preferences.budget,
      hunger: preferences.hunger,
      skewerCount: preferences.skewerCount,
      moods: preferences.moods,
      startingDrinkId: selectedDrink?.id || '',
      startingDrinkName: selectedDrink?.name || '',
      mustShishito: preferences.mustShishito,
      wantFinish: preferences.wantFinish,
      avoidRecent: preferences.avoidRecent,
      shochuKeepUsed: Boolean(order.items?.some(item => item.id === KEEP_SHOCHU_FEE.id || item.category === 'fee')),
      visitStage: '',
      plansSecondVenue: null,
      seafoodRequested: null,
      meatRequested: null,
      seasonalRequested: null,
      stayDurationMinutes: null,
      otherWishes: ''
    }, state.menu);
  }
  function normalizeHistoryItem(raw, menu = state?.menu || defaultMenu) {
    if (!raw || typeof raw !== 'object') return null;
    const visitedAtInput = String(raw.visitedAt ?? raw['来店日時'] ?? '').trim();
    const date = String(raw.date ?? raw['日付'] ?? visitedAtInput).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const id = String(raw.id ?? raw.orderHistoryId ?? raw['注文履歴ID'] ?? uid('history'));
    const storeId = String(raw.storeId ?? raw['店舗ID'] ?? DEFAULT_STORE_ID).trim() || DEFAULT_STORE_ID;
    const visitId = String(raw.visitId ?? raw['来店ID'] ?? `visit-${id}`);
    const hasVisitTime = /^\d{4}-\d{2}-\d{2}T/.test(visitedAtInput) && Number.isFinite(new Date(visitedAtInput).getTime());
    const visitedAt = hasVisitTime ? visitedAtInput : `${date}T00:00:00+09:00`;
    const order = raw.items ?? raw.order ?? raw['注文'] ?? raw['注文内容'];
    const rawItems = Array.isArray(order) ? order : String(order || '').split(/[|｜]/).map(name => name.trim()).filter(Boolean);
    const items = rawItems.map((item, index) => normalizeHistoryLine(item, index, id, storeId, menu)).filter(Boolean).sort((a, b) => a.orderIndex - b.orderIndex);
    if (!items.length) return null;
    const calculatedTotal = items.every(item => historyUnitPrice(item) !== null) ? items.reduce((sum, item) => sum + historyUnitPrice(item) * item.quantity, 0) : null;
    const totalInput = raw.total ?? raw['会計金額'];
    const rawTotal = totalInput === null || totalInput === undefined || totalInput === '' ? NaN : Number(totalInput);
    const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? Math.round(rawTotal) : calculatedTotal;
    const recordedAtInput = String(raw.recordedAt ?? raw['記録日時'] ?? '').trim();
    const recordedAt = Number.isFinite(new Date(recordedAtInput).getTime()) ? recordedAtInput : '';
    const context = normalizeVisitContext(raw.context ?? raw['状況'], menu);
    const feedback = normalizeFeedback(raw.feedback ?? raw['フィードバック']);
    return { id, visitId, storeId, date, visitedAt, visitTimeKnown: raw.visitTimeKnown === true || hasVisitTime, recordedAt, total, context, items, ...(hasFeedback(feedback) ? { feedback } : {}) };
  }
  function normalizePendingOrder(raw) {
    if (!raw || !raw.order || !Array.isArray(raw.order.items)) return null;
    const items = raw.order.items.map(item => {
      const normalized = normalizeMenuItem(item);
      if (!normalized) return null;
      return {
        ...normalized,
        ...(item.manuallyAdded ? { manuallyAdded: true } : {}),
        ...(item.manuallyChanged ? { manuallyChanged: true } : {}),
        ...(item.userSelectedCandidate ? { userSelectedCandidate: true } : {}),
        ...(item.featuredDishCandidate ? { featuredDishCandidate: true } : {}),
        ...(normalizeSuggestedItem(item.changedFrom) ? { changedFrom: normalizeSuggestedItem(item.changedFrom) } : {}),
        ...(item.changeReason ? { changeReason: String(item.changeReason) } : {}),
        ...(item.recommendationReason ? { recommendationReason: String(item.recommendationReason) } : {})
      };
    }).filter(Boolean);
    if (!items.length) return null;
    const basePreferences = defaultState().preferences;
    const preferences = { ...basePreferences, ...(raw.order.preferences || {}), budget: ORDER_BUDGET, avoidRecent: true };
    preferences.hunger = normalizeHungerPreference(preferences.hunger);
    preferences.selectedDishId = String(preferences.selectedDishId || '');
    preferences.featuredDishId = String(preferences.featuredDishId || '');
    preferences.featuredDishDate = String(preferences.featuredDishDate || '');
    preferences.includeFeaturedDish = preferences.includeFeaturedDish === true;
    preferences.moods = Array.isArray(preferences.moods) ? preferences.moods.map(String) : [];
    preferences.skewerCount = Math.max(0, Math.round(Number(preferences.skewerCount) || 0));
    const savedAtValue = String(raw.savedAt || '');
    const savedAt = Number.isFinite(new Date(savedAtValue).getTime()) ? savedAtValue : new Date().toISOString();
    const storeId = String(raw.order.storeId ?? raw.storeId ?? DEFAULT_STORE_ID).trim() || DEFAULT_STORE_ID;
    return {
      storeId,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? String(raw.date) : todayKey(),
      savedAt,
      order: {
        storeId,
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
    $('#appVersion').textContent = `v${APP_VERSION}`;
    $('#menuDataVersion').textContent = MENU_DATA_UPDATED_AT;
    const activeStore = getActiveStore();
    $('#storeInfo').textContent = `${activeStore.name}（${activeStore.id}）`;
    $('#todayLabel').textContent = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
    getTodayOutOfStockIds();
    renderMoodChoices();
    applyPreferences();
    saveState();
    $('#preferenceForm').addEventListener('submit', event => {
      event.preventDefault();
      const preferences = readPreferences();
      currentOrder = createOrder(preferences);
      renderOrder(currentOrder, 'new');
    });
    $$('input[name="hunger"]').forEach(input => input.addEventListener('change', () => {
      if (!input.checked) return;
      state.preferences.hunger = normalizeHungerPreference(input.value);
      saveState();
    }));
    $('#includeFeaturedDish').addEventListener('change', event => {
      state.preferences.includeFeaturedDish = event.currentTarget.checked;
      saveState();
    });
    window.addEventListener('hidaka:supabase-status', event => renderSupabaseStatus(event.detail));
    $('#cloudLoginButton').addEventListener('click', openCloudLoginDialog);
    $('#cloudLoginForm').addEventListener('submit', submitCloudLogin);
    $('#verifyCloudMagicLink').addEventListener('click', verifyCloudMagicLink);
    $('#cancelCloudLogin').addEventListener('click', () => $('#cloudLoginDialog').close());
    $('#cloudVerifyButton').addEventListener('click', verifyCloudRead);
    $('#cloudLogoutButton').addEventListener('click', logoutCloud);
    $('#dataButton').addEventListener('click', openDataDialog);
    $$('input[name="menuSortMode"]').forEach(input => input.addEventListener('change', () => {
      if (!input.checked) return;
      state.menuSortMode = input.value;
      saveState();
      renderMenuEditor();
    }));
    $('#addMenuItem').addEventListener('click', () => openMenuForm());
    $('#menuItemForm').addEventListener('submit', saveMenuItem);
    $('#cancelMenuEdit').addEventListener('click', () => $('#menuItemDialog').close());
    $('#addToOrderForm').addEventListener('submit', addItemToCurrentOrder);
    $('#cancelOrderAddition').addEventListener('click', () => $('#addToOrderDialog').close());
    $('#changeOrderItemForm').addEventListener('submit', changeCurrentOrderItem);
    $('#cancelOrderChange').addEventListener('click', () => $('#changeOrderItemDialog').close());
    $('#feedbackForm').addEventListener('submit', saveFeedback);
    $('#feedbackLater').addEventListener('click', closeFeedbackDialog);
    $('#clearSatisfaction').addEventListener('click', () => $$('input[name="satisfaction"]').forEach(input => { input.checked = false; }));
    $('#downloadFullBackup').addEventListener('click', downloadFullBackup);
    $('#restoreFullBackupFile').addEventListener('change', restoreFullBackup);
    $('#importFile').addEventListener('change', importFile);
    $('#downloadCurrentMenu').addEventListener('click', downloadCurrentMenuBackup);
    $('#downloadMenuTemplate').addEventListener('click', downloadDefaultMenu);
    $('#downloadHistoryTemplate').addEventListener('click', () => download('hidaka-history-sample.csv', `店舗ID,日付,注文\n${getActiveStoreId()},2026-08-01,ハイボール|酢モツ|ししとう串|手羽先\n`));
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
    p.skewerCount = FIXED_SKEWER_COUNT;
    p.mustShishito = true;
    p.wantFinish = false;
    p.selectedDishId = '';
    p.hunger = normalizeHungerPreference(p.hunger);
    $(`input[name="hunger"][value="${p.hunger}"]`).checked = true;
    p.drink = renderDrinkOptions(p.drink);
    $$('input[name="mood"]').forEach(input => { input.checked = p.moods.includes(input.value); });
    p.avoidRecent = true;
    renderFeaturedDishCandidate();
  }

  function renderMoodChoices() {
    const container = $('#moodChoices');
    const selected = new Set(state.preferences?.moods || []);
    const tags = new Map();
    state.menu.filter(isMenuAvailable).forEach(item => item.tags.forEach(tag => {
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
    const featuredToggle = $('#includeFeaturedDish');
    const preferences = {
      budget: ORDER_BUDGET, hunger: normalizeHungerPreference($('input[name="hunger"]:checked')?.value), selectedDishId: '',
      featuredDishId: String(featuredToggle.dataset.itemId || ''), featuredDishDate: todayKey(), includeFeaturedDish: featuredToggle.checked,
      skewerCount: FIXED_SKEWER_COUNT, drink: $('#drink').value, moods: $$('input[name="mood"]:checked').map(input => input.value),
      mustShishito: true, wantFinish: false, avoidRecent: true
    };
    state.preferences = preferences;
    saveState();
    return preferences;
  }

  function stableCandidateJitter(item, context = '') {
    const seed = `${todayKey()}|${context}|${item.id}|${item.name}`;
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function recentFeaturedDishNames(visitLimit = 3) {
    const mainById = new Map(state.menu.filter(item => item.category === 'main').map(item => [String(item.id), item]));
    const mainByName = new Map(state.menu.filter(item => item.category === 'main').map(item => [historyNameKey(item.name), item]));
    const names = new Set();
    sortedHistory().slice(0, visitLimit).forEach(entry => entry.items.forEach(line => {
      const matched = mainById.get(String(line.menuId || '')) || mainByName.get(historyNameKey(line.name));
      if (matched) names.add(historyNameKey(matched.name));
    }));
    return names;
  }

  function getFeaturedDishCandidate(preferredId = '', excludedIds = getTodayOutOfStockIds()) {
    const excluded = new Set(excludedIds.map(String));
    const recent = recentOrderStats();
    const options = state.menu.filter(item =>
      isMenuAvailable(item) &&
      item.category === 'main' &&
      !excluded.has(String(item.id))
    );
    const preferred = state.preferences.featuredDishDate === todayKey()
      ? options.find(item => String(item.id) === String(preferredId))
      : null;
    if (preferred) return preferred;
    const recentNames = recentFeaturedDishNames(3);
    const notRecentlyOrdered = options.filter(item => !recentNames.has(historyNameKey(item.name)));
    const pool = notRecentlyOrdered.length ? notRecentlyOrdered : options;
    return pool.sort((a, b) => {
      const penaltyDifference = recent.penalty(a) - recent.penalty(b);
      if (penaltyDifference) return penaltyDifference;
      return stableCandidateJitter(b, 'featured-main') - stableCandidateJitter(a, 'featured-main') || a.name.localeCompare(b.name, 'ja');
    })[0] || null;
  }

  function renderFeaturedDishCandidate() {
    const container = $('#featuredDishCandidate');
    const toggle = $('#includeFeaturedDish');
    const candidate = getFeaturedDishCandidate(state.preferences.featuredDishId);
    if (!candidate) {
      state.preferences.featuredDishId = '';
      state.preferences.featuredDishDate = '';
      state.preferences.includeFeaturedDish = false;
      toggle.dataset.itemId = '';
      toggle.checked = false;
      toggle.disabled = true;
      container.innerHTML = '<p>現在選べる一品料理がありません。</p>';
      saveState();
      return;
    }
    const sameCandidate = state.preferences.featuredDishDate === todayKey() && String(state.preferences.featuredDishId) === String(candidate.id);
    state.preferences.featuredDishId = String(candidate.id);
    state.preferences.featuredDishDate = todayKey();
    state.preferences.includeFeaturedDish = sameCandidate && state.preferences.includeFeaturedDish === true;
    toggle.dataset.itemId = String(candidate.id);
    toggle.checked = state.preferences.includeFeaturedDish;
    toggle.disabled = false;
    const offeringLabel = OFFERING_TYPE_LABEL[candidate.offeringType];
    const detail = `${CATEGORY_LABEL[candidate.category]}${offeringLabel && candidate.offeringType !== 'regular' ? `・${offeringLabel}` : ''}`;
    container.innerHTML = `<div><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(detail)}</small></div><b>${yen(candidate.price)}</b>`;
    saveState();
  }

  function renderDrinkOptions(selectedValue) {
    const select = $('#drink');
    const drinks = state.menu.filter(item => isMenuAvailable(item) && item.category === 'drink');
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
      .filter(entry => (entry.storeId || DEFAULT_STORE_ID) === getActiveStoreId())
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

  function offeringReason(item) {
    if (item?.offeringType === 'seasonal') return '現在提供中の季節メニュー';
    if (item?.offeringType === 'limited') return '現在提供中の期間限定メニュー';
    return '';
  }
  function appendOfferingReason(reason, item) {
    const offering = offeringReason(item);
    return offering ? `${reason ? `${reason}／` : ''}${offering}` : reason;
  }

  function createOrder(p, excludedIds = getTodayOutOfStockIds()) {
    p = {
      ...p,
      hunger: normalizeHungerPreference(p.hunger),
      selectedDishId: '',
      featuredDishId: String(p.featuredDishId || ''),
      featuredDishDate: String(p.featuredDishDate || todayKey()),
      includeFeaturedDish: p.includeFeaturedDish === true,
      skewerCount: FIXED_SKEWER_COUNT,
      moods: Array.isArray(p.moods) ? p.moods : [],
      mustShishito: true,
      wantFinish: false
    };
    const excluded = new Set(excludedIds.map(String));
    const selected = [];
    const add = (item, recommendationReason = '') => {
      if (item && isMenuAvailable(item) && !excluded.has(String(item.id)) && !selected.some(choice => choice.name === item.name)) selected.push({ ...item, recommendationReason: appendOfferingReason(recommendationReason, item) });
      return item;
    };
    const recent = recentOrderStats();
    const candidates = (category) => state.menu.filter(item => isMenuAvailable(item) && (!category || item.category === category) && !excluded.has(String(item.id))).filter(item => !selected.some(choice => choice.name === item.name));
    const score = (item, kind) => {
      let value = Math.random() * 0.8;
      if (p.moods.some(tag => hasTag(item, tag))) value += 5;
      value -= recent.penalty(item);
      return value - item.price / 12000;
    };
    const reasonFor = (item, kind) => {
      if (!item) return '';
      const moodMatches = p.moods.filter(tag => hasTag(item, tag)).map(tag => MOOD_LABEL[tag] || TAG_LABEL[tag] || tag);
      if (moodMatches.length) return `食べたいもの「${moodMatches.join('・')}」に合うため`;
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
    const dishTarget = HUNGER_DISH_COUNT[p.hunger] || HUNGER_DISH_COUNT.normal;
    add(KEEP_SHOCHU_FEE, '焼酎キープの固定割代');
    if (p.drink !== 'none') {
      const selectedDrink = state.menu.find(item => item.id === p.drink && item.category === 'drink');
      if (!selectedDrink) unavailable.push('選択した飲み物がメニューに登録されていないため、入れられませんでした。');
      else if (!isMenuAvailable(selectedDrink)) unavailable.push(`選択した飲み物「${selectedDrink.name}」は休止中または提供期間外のため、入れられませんでした。`);
      else if (excluded.has(selectedDrink.id)) unavailable.push(`選択した飲み物「${selectedDrink.name}」は品切れとして除外しました。`);
      else add(selectedDrink, '最初の飲み物として指定');
    }
    const registeredShishito = state.menu.find(item => item.name === 'ししとう串') || state.menu.find(item => item.category === 'skewer' && (/ししとう/.test(item.name) || hasTag(item, 'shishito')));
    if (!registeredShishito) unavailable.push('固定ルールのししとうがメニューに登録されていないため、入れられませんでした。');
    else if (!isMenuAvailable(registeredShishito)) unavailable.push('固定ルールのししとうは休止中または提供期間外のため、入れられませんでした。');
    else if (excluded.has(String(registeredShishito.id))) unavailable.push('固定ルールのししとうは品切れとして除外しました。');
    else add(registeredShishito, '串5本の固定ルールで必ず入れる1本');

    while (selected.filter(item => item.category === 'skewer').length < p.skewerCount) {
      const skewer = choose('skewer', 'skewer');
      if (!skewer) break;
      add(skewer, `固定ルールの串 ${p.skewerCount}本を構成するため`);
    }

    const selectedDishCount = () => selected.filter(item => item.category === 'small').length;
    while (selectedDishCount() < dishTarget) {
      let dishOptions = candidates('small');
      dishOptions = recent.preferNotLatest(dishOptions);
      const dish = dishOptions.sort((a, b) => score(b, 'dish') - score(a, 'dish'))[0];
      if (!dish) break;
      const baseReason = reasonFor(dish, 'dish');
      add(dish, `${baseReason}／つまみの量「${HUNGER_LABEL[p.hunger] || HUNGER_LABEL.normal}」に合わせたつまみ・小鉢 ${dishTarget}品のうちの1品`);
    }
    if (p.includeFeaturedDish) {
      const featuredDish = state.menu.find(item => String(item.id) === p.featuredDishId && item.category === 'main');
      if (!featuredDish) unavailable.push('今日の一品候補がメニューに見つからないため、入れられませんでした。');
      else if (!isMenuAvailable(featuredDish)) unavailable.push(`今日の一品候補「${featuredDish.name}」は休止中または提供期間外のため、入れられませんでした。`);
      else if (excluded.has(String(featuredDish.id))) unavailable.push(`今日の一品候補「${featuredDish.name}」は品切れのため、入れられませんでした。`);
      else add({ ...featuredDish, featuredDishCandidate: true }, '今日の一品候補で「注文に入れる」を選択');
    }
    selected.sort((a, b) => ({ drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 }[a.category] - { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 }[b.category]));
    const total = selected.reduce((sum, item) => sum + item.price, 0);
    const actualSkewerCount = selected.filter(item => item.category === 'skewer').length;
    const actualDishCount = selectedDishCount();
    if (actualSkewerCount < p.skewerCount) unavailable.push(`利用可能な串が不足しているため、希望の ${p.skewerCount}本に届かず ${actualSkewerCount}本までとなりました。`);
    if (actualDishCount < dishTarget) unavailable.push(`利用可能なつまみ・小鉢が不足しているため、希望の ${dishTarget}品に届かず ${actualDishCount}品までとなりました。`);
    const budgetMessage = budgetGuidance(selected, p.budget);
    if (budgetMessage) unavailable.unshift(budgetMessage);
    const excludedNames = state.menu.filter(item => excluded.has(item.id)).map(item => item.name);
    if (excludedNames.length) unavailable.unshift(`品切れとして除外中: ${excludedNames.join('・')}`);
    return { storeId: getActiveStoreId(), items: selected, total, budget: p.budget, unavailable, preferences: p, excludedIds: [...excluded] };
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
      value -= Math.abs(item.price - original.price) / 1000;
      return value + Math.random() * 0.8;
    };

    const findReplacement = (original) => {
      const available = state.menu.filter(item =>
        isMenuAvailable(item) &&
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

      const retainedManualState = item.manuallyAdded
        ? { manuallyAdded: true }
        : (item.manuallyChanged ? { manuallyChanged: true, changedFrom: item.changedFrom, changeReason: item.changeReason || '' } : {});
      const retainedCandidateState = item.featuredDishCandidate ? { featuredDishCandidate: true } : {};
      items.push({ ...replacement, ...retainedManualState, ...retainedCandidateState, recommendationReason: appendOfferingReason(`品切れの「${item.name}」と同じ分類から代替`, replacement) });
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
    const changedItems = order?.items.filter(item => item.manuallyChanged) || [];
    const regenerated = createOrder(preferences);
    if (!manualItems.length && !changedItems.length) return regenerated;
    changedItems.forEach(changedItem => {
      const changedFrom = changedItem.changedFrom || {};
      let replaceIndex = regenerated.items.findIndex(item => String(item.id) === String(changedFrom.menuId || changedFrom.id));
      if (replaceIndex < 0 && changedFrom.category) replaceIndex = regenerated.items.findIndex(item => item.category === changedFrom.category && item.category !== 'fee');
      if (replaceIndex >= 0) regenerated.items.splice(replaceIndex, 1);
    });
    const priority = { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 };
    const items = [...regenerated.items, ...changedItems, ...manualItems].sort((a, b) => priority[a.category] - priority[b.category]);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    return { ...regenerated, items, total };
  }

  function replaceOrderItemManually(order, itemIndex, replacement, changeReason = '') {
    if (!order?.items?.[itemIndex] || !replacement) return order;
    const original = order.items[itemIndex];
    const changedFrom = normalizeSuggestedItem(original.changedFrom) || normalizeSuggestedItem({
      id: original.id,
      name: original.name,
      price: original.price,
      category: original.category,
      recommendationReason: original.recommendationReason || ''
    });
    const reason = String(changeReason || '').trim();
    const changedItem = {
      ...replacement,
      manuallyChanged: true,
      changedFrom,
      changeReason: reason,
      recommendationReason: `「${changedFrom.name}」から手動で変更${reason ? `（${reason}）` : ''}`
    };
    const items = [...order.items];
    items[itemIndex] = changedItem;
    const notices = order.unavailable.filter(message => !message.startsWith('目安予算 '));
    const budgetMessage = budgetGuidance(items, order.budget);
    if (budgetMessage) notices.unshift(budgetMessage);
    return { ...order, items, total: items.reduce((sum, item) => sum + item.price, 0), unavailable: notices };
  }

  function orderHeading(order) {
    const mood = order.preferences.moods.map(value => MOOD_LABEL[value] || TAG_LABEL[value] || value).join('・');
    const base = mood ? `${mood}を優先したおすすめ` : order.preferences.hunger === 'light' ? 'つまみ軽めのおすすめ' : order.preferences.hunger === 'hearty' ? 'つまみ多めのおすすめ' : 'バランスのよいおすすめ';
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
      const moodMark = moodMatches.length ? '<span class="mood-match">★ 希望に合う</span>' : '';
      const selectedMark = item.featuredDishCandidate ? '<span class="candidate-selected-mark">今日の一品</span>' : (item.userSelectedCandidate ? '<span class="candidate-selected-mark">選んだ1品</span>' : '');
      const reason = item.recommendationReason ? `<small class="recommendation-reason">理由: ${escapeHtml(item.recommendationReason)}</small>` : '';
      const stockControl = item.category === 'fee' ? '' : `<label class="out-of-stock"><input class="out-of-stock-check" type="checkbox" data-item-id="${escapeHtml(item.id)}" /> 品切れ</label>`;
      const changedMark = item.manuallyChanged ? '<span class="manual-change-mark">変更済み</span>' : '';
      const changeControl = item.category === 'fee' || item.manuallyAdded ? '' : `<button class="change-order-item" type="button" data-item-index="${index}">変更</button>`;
      return `<li class="order-item"><span class="order-number">${index + 1}</span><div class="order-details"><strong>${escapeHtml(item.name)}${moodMark}${selectedMark}${changedMark}</strong><small>${CATEGORY_LABEL[item.category]}</small>${reason}</div><div class="order-item-controls"><span class="order-price">${yen(item.price)}</span><div>${changeControl}${stockControl}</div></div></li>`;
    }).join('') : '<li class="order-item"><div class="order-details"><strong>この条件ではメニューを組めませんでした</strong><small>メニュー登録や品切れ状況を確認してください。</small></div></li>';
    const unavailable = order.unavailable.length ? `<p class="notice">${order.unavailable.map(escapeHtml).join('<br>')}</p>` : '';
    $('#result').innerHTML = `<article class="result-card"><div class="result-top"><p>頼む順番まで、このままどうぞ</p><h2>${orderHeading(order)}</h2><div class="price-summary"><strong>${yen(order.total)}</strong><small>目安 ${yen(order.budget)}<br>${budgetStatus}${isEstimate ? '（価格は目安）' : ''}</small></div></div><ol class="order-list">${list}</ol>${unavailable}<div class="result-actions"><button class="secondary-button" type="button" id="regenerate">組み直す</button><button class="secondary-button" type="button" id="reconsiderOutOfStock" disabled>品切れを除いて組み直す</button><button class="secondary-button" type="button" id="addFromMenu">メニューから追加</button><button class="secondary-button start-over-button" type="button" id="startOver">条件をリセットして最初から</button><button class="primary-button pending-record-button" type="button" id="recordOrder">この注文を記録</button></div></article>`;
    const reconsiderButton = $('#reconsiderOutOfStock');
    const stockChecks = $$('.out-of-stock-check');
    stockChecks.forEach(check => check.addEventListener('change', () => { reconsiderButton.disabled = !stockChecks.some(input => input.checked); }));
    $$('.change-order-item').forEach(button => button.addEventListener('click', () => openChangeOrderItemDialog(Number(button.dataset.itemIndex))));
    reconsiderButton.addEventListener('click', () => {
      const checkedIds = stockChecks.filter(input => input.checked).map(input => input.dataset.itemId);
      const excludedIds = markOutOfStock(checkedIds);
      currentOrder = replaceOutOfStockItems(currentOrder, checkedIds, excludedIds);
      renderOrder(currentOrder);
    });
    $('#regenerate').addEventListener('click', () => { currentOrder = regenerateOrderKeepingManualItems(currentOrder, readPreferences()); renderOrder(currentOrder); });
    $('#addFromMenu').addEventListener('click', openAddToOrderDialog);
    $('#startOver').addEventListener('click', resetOrderPlanning);
    $('#recordOrder').addEventListener('click', recordCurrentOrder);
  }

  function resetOrderPlanning() {
    clearPendingReminderTimer();
    state.pendingOrder = null;
    state.preferences = { ...defaultState().preferences, moods: [] };
    currentOrder = null;
    const pendingDialog = $('#pendingOrderDialog');
    if (pendingDialog.open) pendingDialog.close();
    saveState();
    applyPreferences();
    $('#result').innerHTML = '<div class="empty-state"><span class="empty-illustration">🍢</span><h2>条件を選んで注文案を作ろう</h2><p>つまみの量と食べたいものから、バランスよく選びます。</p></div>';
    $('#preferenceForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function createHistoryRecord(order, date = todayKey(), pendingSavedAt = '') {
    const id = uid('history');
    const visitId = uid('visit');
    const recordedAt = new Date().toISOString();
    const savedAtDate = String(pendingSavedAt || '').slice(0, 10);
    const hasVisitTime = savedAtDate === date && Number.isFinite(new Date(pendingSavedAt).getTime());
    const visitedAt = hasVisitTime ? pendingSavedAt : `${date}T00:00:00+09:00`;
    const items = order.items.map((item, index) => ({
      lineId: `${id}-line-${index + 1}`,
      menuId: item.id || '',
      name: item.name,
      orderIndex: index + 1,
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      unitPrice: item.price,
      source: item.manuallyAdded ? 'manual' : (item.manuallyChanged ? 'changed' : (item.category === 'fee' ? 'fixed' : 'recommended')),
      recommendationReason: item.recommendationReason || '',
      ...(item.manuallyChanged && item.changedFrom ? { aiSuggestion: item.changedFrom, changeReason: item.changeReason || '' } : {})
    }));
    return normalizeHistoryItem({ id, visitId, storeId: order.storeId || getActiveStoreId(), date, visitedAt, visitTimeKnown: hasVisitTime, recordedAt, total: order.total, context: createVisitContext(order), items }, state.menu);
  }

  function recordCurrentOrder() {
    if (!currentOrder?.items.length) return;
    const orderDate = state.pendingOrder?.date || todayKey();
    const historyRecord = createHistoryRecord(currentOrder, orderDate, state.pendingOrder?.savedAt || '');
    if (!historyRecord) return;
    state.history.push(historyRecord);
    state.history = state.history.slice(-100);
    state.pendingOrder = null;
    state.preferences.selectedDishId = '';
    state.preferences.includeFeaturedDish = false;
    saveState();
    clearPendingReminderTimer();
    const dialog = $('#pendingOrderDialog');
    if (dialog.open) dialog.close();
    renderHistorySummary();
    renderFeaturedDishCandidate();
    const button = $('#recordOrder');
    if (button) {
      button.textContent = '記録しました ✓';
      button.disabled = true;
      button.classList.remove('pending-record-button');
    }
    openFeedbackDialog(historyRecord.id);
  }

  function openAddToOrderDialog() {
    if (!currentOrder) return;
    const excludedIds = new Set(getTodayOutOfStockIds());
    const choices = state.menu.filter(item => isMenuAvailable(item) && !excludedIds.has(item.id));
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
    if (!item || !isMenuAvailable(item) || getTodayOutOfStockIds().includes(item.id)) { $('#addOrderStatus').textContent = 'この商品は休止中・提供期間外または品切れのため追加できません。'; return; }
    const priority = { drink: 1, small: 2, skewer: 3, main: 4, finish: 5, dessert: 6, fee: 7 };
    const manuallyAddedItem = { ...item, manuallyAdded: true, recommendationReason: 'メニューから手動で追加' };
    const items = [...currentOrder.items, manuallyAddedItem].sort((a, b) => priority[a.category] - priority[b.category]);
    currentOrder = { ...currentOrder, items, total: currentOrder.total + manuallyAddedItem.price };
    $('#addToOrderDialog').close();
    renderOrder(currentOrder);
  }

  function openChangeOrderItemDialog(itemIndex) {
    const original = currentOrder?.items?.[itemIndex];
    if (!original || original.category === 'fee' || original.manuallyAdded) return;
    const excludedIds = new Set(getTodayOutOfStockIds());
    const choices = state.menu.filter(item => isMenuAvailable(item) && !excludedIds.has(item.id) && item.id !== original.id);
    const select = $('#replacementItem');
    select.replaceChildren(...choices.map(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name}（${CATEGORY_LABEL[item.category]}・${yen(item.price)}）`;
      return option;
    }));
    $('#changeSourceItem').textContent = `${original.name}（${yen(original.price)}）`;
    $('#orderChangeReason').value = '';
    $('#changeOrderStatus').textContent = choices.length ? '品切れには登録されず、今回の注文だけを変更します。' : '変更先に選べる商品がありません。';
    $('#confirmOrderChange').disabled = choices.length === 0;
    const dialog = $('#changeOrderItemDialog');
    dialog.dataset.itemIndex = String(itemIndex);
    dialog.showModal();
  }

  function changeCurrentOrderItem(event) {
    event.preventDefault();
    if (!currentOrder) return;
    const dialog = $('#changeOrderItemDialog');
    const itemIndex = Number(dialog.dataset.itemIndex);
    const replacement = state.menu.find(item => item.id === $('#replacementItem').value);
    if (!Number.isInteger(itemIndex) || !replacement || !isMenuAvailable(replacement) || getTodayOutOfStockIds().includes(replacement.id)) {
      $('#changeOrderStatus').textContent = 'この商品には変更できません。メニューの提供状態を確認してください。';
      return;
    }
    currentOrder = replaceOrderItemManually(currentOrder, itemIndex, replacement, $('#orderChangeReason').value);
    dialog.close();
    renderOrder(currentOrder);
  }

  function renderHistorySummary() {
    const history = sortedHistory();
    if (!history.length) { $('#historySummary').innerHTML = '<h2>注文履歴</h2><p>まだ履歴はありません。注文を記録すると、次回は食べたばかりの料理を避けられます。</p>'; return; }
    const latest = history[0];
    $('#historySummary').innerHTML = `<h2>前回の注文 <span>(${escapeHtml(latest.date)})</span></h2><p>${latest.items.map(item => escapeHtml(item.name)).join('・')}</p><button class="text-button history-open-button" type="button" id="viewHistory">すべての履歴を見る（${history.length}件）</button>`;
    $('#viewHistory').addEventListener('click', openHistoryDialog);
  }

  const FEEDBACK_REPEAT_LABEL = { again: 'また頼みたい', avoid: '次回は避けたい', none: '特になし' };
  const FEEDBACK_AMOUNT_LABEL = { small: '量が少ない', just: '量はちょうどよい', large: '量が多い' };
  const FEEDBACK_PRICE_LABEL = { cheap: '金額は安い', fair: '金額は適切', expensive: '金額は高い' };

  function feedbackSummary(feedback) {
    if (!hasFeedback(feedback)) return '';
    return [
      feedback.satisfaction !== null ? `満足度 ${feedback.satisfaction}/5` : '',
      FEEDBACK_REPEAT_LABEL[feedback.repeatPreference] || '',
      FEEDBACK_AMOUNT_LABEL[feedback.amount] || '',
      FEEDBACK_PRICE_LABEL[feedback.priceFeeling] || ''
    ].filter(Boolean).join('・');
  }

  function openFeedbackDialog(historyId, returnToHistory = false) {
    const entry = state.history.find(item => item.id === historyId);
    if (!entry) return;
    const historyDialog = $('#historyDialog');
    if (historyDialog.open) historyDialog.close();
    const form = $('#feedbackForm');
    form.reset();
    const feedback = normalizeFeedback(entry.feedback);
    if (feedback.satisfaction !== null) {
      const satisfaction = $(`input[name="satisfaction"][value="${feedback.satisfaction}"]`);
      if (satisfaction) satisfaction.checked = true;
    }
    const repeatPreference = $(`input[name="repeatPreference"][value="${feedback.repeatPreference || 'none'}"]`);
    if (repeatPreference) repeatPreference.checked = true;
    const amount = $(`input[name="feedbackAmount"][value="${feedback.amount || 'none'}"]`);
    if (amount) amount.checked = true;
    const priceFeeling = $(`input[name="priceFeeling"][value="${feedback.priceFeeling || 'none'}"]`);
    if (priceFeeling) priceFeeling.checked = true;
    $('#feedbackComment').value = feedback.comment || '';
    $('#feedbackOrderInfo').textContent = `${entry.date}・${entry.items.length}品・${entry.total !== null ? yen(entry.total) : '金額記録なし'}`;
    $('#feedbackStatus').textContent = hasFeedback(feedback) ? '保存済みの内容を編集できます。' : 'すべて任意です。入力しない項目があっても構いません。';
    $('#feedbackLater').textContent = returnToHistory ? 'キャンセル' : '後で入力';
    const dialog = $('#feedbackDialog');
    dialog.dataset.historyId = historyId;
    dialog.dataset.returnToHistory = returnToHistory ? 'true' : 'false';
    dialog.showModal();
  }

  function closeFeedbackDialog() {
    const dialog = $('#feedbackDialog');
    const returnToHistory = dialog.dataset.returnToHistory === 'true';
    if (dialog.open) dialog.close();
    if (returnToHistory) openHistoryDialog();
  }

  function saveFeedback(event) {
    event.preventDefault();
    const dialog = $('#feedbackDialog');
    const entry = state.history.find(item => item.id === dialog.dataset.historyId);
    if (!entry) return;
    const satisfaction = $('input[name="satisfaction"]:checked');
    const repeatPreference = $('input[name="repeatPreference"]:checked')?.value || 'none';
    const amountValue = $('input[name="feedbackAmount"]:checked')?.value || 'none';
    const priceValue = $('input[name="priceFeeling"]:checked')?.value || 'none';
    const feedback = normalizeFeedback({
      satisfaction: satisfaction ? Number(satisfaction.value) : null,
      repeatPreference: repeatPreference === 'none' ? '' : repeatPreference,
      amount: amountValue === 'none' ? '' : amountValue,
      priceFeeling: priceValue === 'none' ? '' : priceValue,
      comment: $('#feedbackComment').value,
      updatedAt: new Date().toISOString()
    });
    if (hasFeedback(feedback)) entry.feedback = feedback;
    else delete entry.feedback;
    saveState();
    closeFeedbackDialog();
  }

  function openHistoryDialog() {
    const history = sortedHistory();
    const list = $('#historyList');
    if (!history.length) {
      list.innerHTML = '<p class="history-empty">まだ注文履歴はありません。</p>';
    } else {
      list.innerHTML = history.map((entry, index) => {
        const hasPrices = entry.items.length > 0 && entry.items.every(item => historyUnitPrice(item) !== null);
        const calculatedTotal = hasPrices ? entry.items.reduce((sum, item) => sum + historyUnitPrice(item) * item.quantity, 0) : null;
        const total = Number.isFinite(Number(entry.total)) && entry.total !== null ? Number(entry.total) : calculatedTotal;
        const totalQuantity = entry.items.reduce((sum, item) => sum + item.quantity, 0);
        const summary = `${totalQuantity}品・${total !== null ? `合計 ${yen(total)}` : '金額記録なし'}`;
        const items = entry.items.map(item => {
          const unitPrice = historyUnitPrice(item);
          const quantity = item.quantity > 1 ? ` ×${item.quantity}` : '';
          const price = unitPrice !== null ? `<span>${yen(unitPrice * item.quantity)}</span>` : '';
          const changeNote = item.source === 'changed' && item.aiSuggestion
            ? `<small class="history-change-note">AI提案「${escapeHtml(item.aiSuggestion.name)}」から変更${item.changeReason ? `（${escapeHtml(item.changeReason)}）` : ''}</small>`
            : '';
          return `<li>${escapeHtml(item.name)}${quantity}${price}${changeNote}</li>`;
        }).join('');
        const feedbackText = feedbackSummary(entry.feedback);
        const feedbackBlock = feedbackText || entry.feedback?.comment
          ? `<div class="history-feedback"><strong>${escapeHtml(feedbackText || '感想')}</strong>${entry.feedback?.comment ? `<p>${escapeHtml(entry.feedback.comment)}</p>` : ''}</div>`
          : '<p class="history-feedback-empty">感想はまだありません。</p>';
        return `<article class="history-entry"><div class="history-entry-header"><strong>${escapeHtml(entry.date)}${index === 0 ? '（前回）' : ''}</strong><span>${summary}</span></div><ol>${items}</ol>${feedbackBlock}<button class="text-button edit-feedback" type="button" data-history-id="${escapeHtml(entry.id)}">${hasFeedback(entry.feedback) ? '感想を編集' : '感想を入力'}</button></article>`;
      }).join('');
      $$('.edit-feedback', list).forEach(button => button.addEventListener('click', () => openFeedbackDialog(button.dataset.historyId, true)));
    }
    const dialog = $('#historyDialog');
    if (!dialog.open) dialog.showModal();
  }

  function openDataDialog() {
    const sortInput = $(`input[name="menuSortMode"][value="${state.menuSortMode || 'tag'}"]`);
    if (sortInput) sortInput.checked = true;
    renderMenuEditor();
    $('#dataDialog').showModal();
  }
  function menuTagSortKey(item) {
    const tags = (item.tags || []).map(canonicalTag).filter(Boolean);
    const standardTags = tags.map(tag => ({ tag, index: MENU_TAG_SORT_ORDER.indexOf(tag) })).filter(entry => entry.index >= 0).sort((a, b) => a.index - b.index);
    if (standardTags.length) return { index: standardTags[0].index, label: localizeTag(standardTags[0].tag) };
    const customTags = tags.map(localizeTag).sort((a, b) => a.localeCompare(b, 'ja'));
    return customTags.length ? { index: MENU_TAG_SORT_ORDER.length, label: customTags[0] } : { index: MENU_TAG_SORT_ORDER.length + 1, label: '' };
  }
  function compareMenuEditorItems(a, b) {
    const aTag = menuTagSortKey(a);
    const bTag = menuTagSortKey(b);
    return aTag.index - bTag.index
      || aTag.label.localeCompare(bTag.label, 'ja')
      || Number(isMenuAvailable(b)) - Number(isMenuAvailable(a))
      || a.name.localeCompare(b.name, 'ja');
  }
  function compareMenuEditorItemsByCategory(a, b) {
    const aIndex = MENU_CATEGORY_OPTIONS.indexOf(a.category);
    const bIndex = MENU_CATEGORY_OPTIONS.indexOf(b.category);
    return (aIndex < 0 ? MENU_CATEGORY_OPTIONS.length : aIndex) - (bIndex < 0 ? MENU_CATEGORY_OPTIONS.length : bIndex)
      || Number(isMenuAvailable(b)) - Number(isMenuAvailable(a))
      || a.name.localeCompare(b.name, 'ja');
  }
  function renderMenuEditor() {
    const availableCount = state.menu.filter(isMenuAvailable).length;
    const pausedCount = state.menu.filter(item => !isMenuManuallyAvailable(item)).length;
    const outOfPeriodCount = state.menu.length - availableCount - pausedCount;
    $('#menuCount').textContent = `提供中 ${availableCount}品・期間外 ${outOfPeriodCount}品・休止 ${pausedCount}品`;
    const editor = $('#menuEditor');
    editor.innerHTML = '';
    const template = $('#menuRowTemplate');
    const comparator = state.menuSortMode === 'category' ? compareMenuEditorItemsByCategory : compareMenuEditorItems;
    state.menu.slice().sort(comparator).forEach(item => {
      const row = template.content.cloneNode(true);
      const available = isMenuAvailable(item);
      const manuallyAvailable = isMenuManuallyAvailable(item);
      const offeringLabel = item.offeringType && item.offeringType !== 'regular' ? ` ・ ${OFFERING_TYPE_LABEL[item.offeringType]}` : '';
      const seasonLabel = item.seasons?.length ? `（${item.seasons.map(season => SEASON_LABEL[season]).join('・')}）` : '';
      const periodLabel = item.availableFrom || item.availableUntil ? ` ・ ${item.availableFrom || '開始未定'}〜${item.availableUntil || '終了未定'}` : '';
      const availabilityLabel = manuallyAvailable ? (available ? '' : ' ・ 期間外') : ' ・ 休止中';
      const tagLabel = item.tags?.length ? ` ・ タグ: ${item.tags.map(localizeTag).join('・')}` : ' ・ タグなし';
      const rowElement = $('.menu-row', row);
      rowElement.classList.toggle('is-inactive', !available);
      $('.menu-name', row).textContent = item.name;
      $('.menu-meta', row).textContent = `${yen(item.price)} ・ ${CATEGORY_LABEL[item.category]}${tagLabel}${offeringLabel}${seasonLabel}${periodLabel}${item.actual ? '' : ' ・ 目安'}${availabilityLabel}`;
      $('.edit-menu-item', row).addEventListener('click', () => openMenuForm(item));
      const availabilityButton = $('.availability-menu-item', row);
      availabilityButton.textContent = manuallyAvailable ? '休止' : '再開';
      availabilityButton.setAttribute('aria-label', `${item.name}を${manuallyAvailable ? '提供休止' : '提供再開'}`);
      availabilityButton.addEventListener('click', () => toggleMenuAvailability(item));
      editor.append(row);
    });
  }

  function openMenuForm(item) {
    $('#menuFormTitle').textContent = item ? 'メニューを編集' : 'メニューを追加';
    $('#itemId').value = item?.id || '';
    $('#itemName').value = item?.name || '';
    $('#itemPrice').value = item?.price ?? '';
    renderMenuCategoryChoices(item?.category || 'small');
    renderMenuTagChoices(item?.tags || []);
    renderOfferingTypeChoices(item?.offeringType || 'regular');
    renderSeasonChoices(item?.seasons || []);
    $('#itemAvailableFrom').value = item?.availableFrom || '';
    $('#itemAvailableUntil').value = item?.availableUntil || '';
    $('#itemMemo').value = item?.memo || '';
    $('#itemActual').checked = item?.actual || false;
    $('#itemAvailable').checked = isMenuManuallyAvailable(item);
    syncOfferingFields();
    $('#menuItemDialog').showModal();
    $('#itemName').focus();
  }
  function createMenuSwitch(name, value, labelText, checked, type) {
    const label = document.createElement('label');
    label.className = 'menu-switch-choice';
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = checked;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;
    label.append(input, labelSpan);
    return label;
  }
  function renderMenuCategoryChoices(selectedCategory) {
    const selected = MENU_CATEGORY_OPTIONS.includes(selectedCategory) ? selectedCategory : 'small';
    $('#itemCategoryChoices').replaceChildren(...MENU_CATEGORY_OPTIONS.map(category => createMenuSwitch('itemCategory', category, CATEGORY_LABEL[category], category === selected, 'radio')));
  }
  function renderOfferingTypeChoices(selectedType) {
    const selected = OFFERING_TYPE_LABEL[selectedType] ? selectedType : 'regular';
    const choices = Object.keys(OFFERING_TYPE_LABEL).map(type => createMenuSwitch('itemOfferingType', type, `${OFFERING_TYPE_LABEL[type]}メニュー`, type === selected, 'radio'));
    choices.forEach(choice => $('input', choice).addEventListener('change', syncOfferingFields));
    $('#itemOfferingTypeChoices').replaceChildren(...choices);
  }
  function renderSeasonChoices(selectedSeasons) {
    const selected = new Set(normalizeSeasons(selectedSeasons));
    $('#itemSeasonChoices').replaceChildren(...Object.keys(SEASON_LABEL).map(season => createMenuSwitch('itemSeason', season, SEASON_LABEL[season], selected.has(season), 'checkbox')));
  }
  function syncOfferingFields() {
    const type = $('input[name="itemOfferingType"]:checked', $('#menuItemForm'))?.value || 'regular';
    $('#seasonSettings').hidden = type !== 'seasonal';
    $('#periodSettings').hidden = type === 'regular';
  }
  function renderMenuTagChoices(selectedTags) {
    const selected = new Set((selectedTags || []).map(canonicalTag));
    const standardTags = new Set(MENU_TAG_GROUPS.flatMap(group => group.tags));
    const registeredTags = state.menu.flatMap(item => item.tags.map(canonicalTag));
    const customTags = [...new Set([...registeredTags, ...selected])].filter(tag => tag && !standardTags.has(tag)).sort((a, b) => localizeTag(a).localeCompare(localizeTag(b), 'ja'));
    const groups = customTags.length ? [...MENU_TAG_GROUPS, { label: 'その他の登録済みタグ', tags: customTags }] : MENU_TAG_GROUPS;
    const fragments = groups.map(group => {
      const section = document.createElement('section');
      section.className = 'menu-tag-group';
      const heading = document.createElement('h3');
      heading.textContent = group.label;
      const choices = document.createElement('div');
      choices.className = 'menu-switch-grid';
      choices.append(...group.tags.map(tag => createMenuSwitch('itemTag', tag, localizeTag(tag), selected.has(tag), 'checkbox')));
      section.append(heading, choices);
      return section;
    });
    $('#itemTagChoices').replaceChildren(...fragments);
  }
  function saveMenuItem(event) {
    event.preventDefault();
    const itemId = $('#itemId').value || uid();
    const existingItem = state.menu.find(menuItem => menuItem.id === itemId);
    const category = $('input[name="itemCategory"]:checked', $('#menuItemForm'))?.value || 'small';
    const tags = $$('input[name="itemTag"]:checked', $('#menuItemForm')).map(input => input.value);
    const offeringType = $('input[name="itemOfferingType"]:checked', $('#menuItemForm'))?.value || 'regular';
    const seasons = $$('input[name="itemSeason"]:checked', $('#menuItemForm')).map(input => input.value);
    const availableFrom = offeringType === 'regular' ? '' : $('#itemAvailableFrom').value;
    const availableUntil = offeringType === 'regular' ? '' : $('#itemAvailableUntil').value;
    if (availableFrom && availableUntil && availableFrom > availableUntil) {
      $('#itemAvailableUntil').setCustomValidity('終了日は開始日以降にしてください。');
      $('#itemAvailableUntil').reportValidity();
      return;
    }
    $('#itemAvailableUntil').setCustomValidity('');
    const item = normalizeMenuItem({ id: itemId, storeId: existingItem?.storeId || getActiveStoreId(), name: $('#itemName').value, price: $('#itemPrice').value, category, tags, actual: $('#itemActual').checked, available: $('#itemAvailable').checked, offeringType, seasons, availableFrom, availableUntil, memo: $('#itemMemo').value, updatedAt: new Date().toISOString() });
    if (!item) return;
    const index = state.menu.findIndex(menuItem => menuItem.id === item.id);
    if (index >= 0) state.menu[index] = item; else state.menu.push(item);
    state.preferences.drink = renderDrinkOptions(state.preferences.drink);
    saveState(); renderMenuEditor(); renderMoodChoices(); renderFeaturedDishCandidate(); $('#menuItemDialog').close();
  }
  function toggleMenuAvailability(item) {
    const nextAvailable = !isMenuManuallyAvailable(item);
    const action = nextAvailable ? '提供を再開' : '提供休止に変更';
    if (!confirm(`「${item.name}」を${action}しますか？${nextAvailable ? '' : '\n休止中は注文候補に表示されません。'}`)) return;
    item.available = nextAvailable;
    state.preferences.drink = renderDrinkOptions(state.preferences.drink);
    saveState(); renderMenuEditor(); renderMoodChoices(); renderFeaturedDishCandidate();
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
      saveState(); renderMenuEditor(); renderDrinkOptions(); renderMoodChoices(); renderFeaturedDishCandidate(); renderHistorySummary();
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
      const normalizedEntries = entries.map(raw => ({ item: normalizeMenuItem(raw), hasAvailability: hasAvailabilityField(raw), hasOffering: hasOfferingFields(raw) })).filter(entry => entry.item);
      const valid = normalizedEntries.map(entry => entry.item);
      importedMenu += valid.length;
      if (!valid.length) throw new Error('メニューとして使える「料理名」と「価格」が見つかりません');
      if (mode === 'replace') state.menu = [];
      normalizedEntries.forEach(({ item, hasAvailability, hasOffering }) => {
        const index = state.menu.findIndex(existing => existing.storeId === item.storeId && existing.name === item.name);
        if (index < 0) { state.menu.push(item); return; }
        const existing = state.menu[index];
        const existingOffering = { offeringType: existing.offeringType, seasons: existing.seasons, availableFrom: existing.availableFrom, availableUntil: existing.availableUntil, memo: existing.memo, updatedAt: existing.updatedAt };
        state.menu[index] = { ...existing, ...item, ...(hasOffering ? {} : existingOffering), id: existing.id, available: hasAvailability ? item.available : isMenuManuallyAvailable(existing) };
      });
    };
    const putHistory = entries => {
      const valid = entries.map(entry => normalizeHistoryItem(entry, state.menu)).filter(Boolean);
      importedHistory += valid.length;
      if (!valid.length) throw new Error('履歴として使える「日付」と「注文」が見つかりません');
      if (mode === 'replace') state.history = [];
      valid.forEach(item => { const index = state.history.findIndex(existing => existing.id === item.id || (existing.storeId === item.storeId && existing.date === item.date && existing.items.map(i => i.name).join('|') === item.items.map(i => i.name).join('|'))); if (index < 0) state.history.push(item); });
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
      source: { app: '日高オーダー', appVersion: APP_VERSION, storageKey: STORAGE_KEY, storeId: getActiveStoreId() },
      data: JSON.parse(JSON.stringify(state))
    };
  }

  function normalizeFullBackup(raw) {
    if (!raw || raw.format !== FULL_BACKUP_FORMAT) throw new Error('日高オーダーの完全バックアップではありません');
    const schemaVersion = Number(raw.schemaVersion);
    if (!Number.isInteger(schemaVersion) || schemaVersion < MIN_SUPPORTED_BACKUP_SCHEMA_VERSION || schemaVersion > FULL_BACKUP_SCHEMA_VERSION) throw new Error(`未対応のバックアップ形式です（バージョン ${raw.schemaVersion ?? '不明'}）`);
    const saved = raw.data;
    if (!saved || !Array.isArray(saved.menu) || !Array.isArray(saved.initialMenu) || !Array.isArray(saved.history)) throw new Error('バックアップに必要なデータが不足しています');
    const base = defaultState();
    const normalizedStores = normalizeStores(saved.stores);
    const stores = normalizedStores.length ? normalizedStores : base.stores;
    const requestedStoreId = String(saved.activeStoreId || raw.source?.storeId || base.activeStoreId);
    const activeStoreId = stores.some(store => store.id === requestedStoreId) ? requestedStoreId : base.activeStoreId;
    const menu = saved.menu.map(normalizeMenuItem).filter(Boolean);
    const initialMenu = saved.initialMenu.map(normalizeMenuItem).filter(Boolean);
    const history = saved.history.map(entry => normalizeHistoryItem(entry, menu)).filter(Boolean);
    if (menu.length !== saved.menu.length || initialMenu.length !== saved.initialMenu.length || history.length !== saved.history.length) throw new Error('壊れているメニューまたは注文履歴が含まれています');
    const preferences = { ...base.preferences, ...(saved.preferences || {}), budget: ORDER_BUDGET, avoidRecent: true };
    preferences.hunger = normalizeHungerPreference(preferences.hunger);
    preferences.selectedDishId = '';
    preferences.featuredDishId = String(preferences.featuredDishId || '');
    preferences.featuredDishDate = String(preferences.featuredDishDate || '');
    preferences.includeFeaturedDish = preferences.featuredDishDate === todayKey() && preferences.includeFeaturedDish === true;
    preferences.moods = Array.isArray(preferences.moods) ? preferences.moods.map(String) : [];
    preferences.skewerCount = FIXED_SKEWER_COUNT;
    preferences.mustShishito = true;
    preferences.wantFinish = false;
    const outOfStock = saved.outOfStock && typeof saved.outOfStock.date === 'string' && Array.isArray(saved.outOfStock.ids)
      ? { date: saved.outOfStock.date, ids: saved.outOfStock.ids.map(String) }
      : base.outOfStock;
    const pendingOrder = normalizePendingOrder(saved.pendingOrder);
    if (saved.pendingOrder && !pendingOrder) throw new Error('未記録注文のデータが壊れています');
    const exportedAt = String(raw.exportedAt || '');
    return {
      exportedAt: Number.isFinite(new Date(exportedAt).getTime()) ? exportedAt : '',
      state: { ...base, dataSchemaVersion: DATA_SCHEMA_VERSION, defaultMenuVersion: activeDefaultMenuVersion, stores, activeStoreId, menu, initialMenu, history, preferences, menuSortMode: ['tag', 'category'].includes(saved.menuSortMode) ? saved.menuSortMode : base.menuSortMode, outOfStock, pendingOrder }
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
        $('#result').innerHTML = '<div class="empty-state"><span class="empty-illustration">🍢</span><h2>条件を選んで注文案を作ろう</h2><p>つまみの量と食べたいものから、バランスよく選びます。</p></div>';
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
  function buildMenuCsv(menu) {
    const rows = [
      ['メニューID', '店舗ID', '料理名', '価格', '分類', 'タグ', '実額', '提供状態', '提供区分', '季節', '提供開始日', '提供終了日', 'メモ', '最終更新日'],
      ...menu.map(item => [item.id, item.storeId || getActiveStoreId(), item.name, item.price, item.category, item.tags.join('|'), item.actual, isMenuManuallyAvailable(item) ? '提供中' : '休止中', OFFERING_TYPE_LABEL[item.offeringType] || '通常', (item.seasons || []).map(season => SEASON_LABEL[season]).join('|'), item.availableFrom || '', item.availableUntil || '', item.memo || '', item.updatedAt || ''])
    ];
    return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`;
  }
  function downloadCurrentMenuBackup() {
    download(`やきとり日高_メニューバックアップ_${todayKey()}.csv`, buildMenuCsv(state.menu));
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
    $('#result').innerHTML = '<div class="empty-state"><span class="empty-illustration">🍢</span><h2>条件を選んで注文案を作ろう</h2><p>つまみの量と食べたいものから、バランスよく選びます。</p></div>';
  }

  function registerInitialMenu() {
    if (!state.menu.length) { $('#initialDataStatus').textContent = 'メニューが空のため登録できません。'; return; }
    if (!confirm('現在のメニューを、今後の初期メニューとして登録しますか？')) return;
    state.initialMenu = cloneMenu(state.menu);
    saveState();
    $('#initialDataStatus').textContent = `${state.initialMenu.length}品を初期メニューとして登録しました。`;
  }

  function renderSupabaseStatus(status) {
    const statusElement = $('#supabaseStatus');
    if (statusElement) {
      statusElement.textContent = status?.label || '未確認（保存は端末）';
      statusElement.dataset.state = status?.state || 'idle';
      statusElement.title = status?.error || '現在の保存先は端末内です。';
    }
    renderCloudAuthStatus(status || {});
  }

  function renderCloudAuthStatus(status) {
    const summary = $('#cloudAuthSummary');
    const counts = $('#cloudDataCounts');
    const loginButton = $('#cloudLoginButton');
    const verifyButton = $('#cloudVerifyButton');
    const logoutButton = $('#cloudLogoutButton');
    if (!summary || !counts || !loginButton || !verifyButton || !logoutButton) return;

    const isChecking = status.state === 'checking';
    const isSignedIn = status.authenticated === true;
    if (isChecking) {
      summary.textContent = 'クラウドを確認しています';
      counts.textContent = '完了までそのままお待ちください。';
    } else if (isSignedIn && status.cloudCounts) {
      summary.textContent = status.userEmail ? `ログイン済み：${status.userEmail}` : '同じ利用者としてログイン済み';
      counts.textContent = `メニュー ${status.cloudCounts.menuItems}件・来店履歴 ${status.cloudCounts.visits}件・店舗設定 ${status.cloudCounts.storeSettings}件を読み取り確認しました。`;
    } else if (isSignedIn) {
      summary.textContent = status.userEmail ? `ログイン済み：${status.userEmail}` : 'ログイン済み・読み取りを再確認してください';
      counts.textContent = status.error || 'クラウドデータを読み取れませんでした。';
    } else if (status.state === 'link-sent') {
      summary.textContent = 'ログイン用メールを送信しました';
      counts.textContent = '届いたメールのリンクを押すと、日高オーダーへ戻って読み取り確認を行います。';
    } else if (!status.configured) {
      summary.textContent = 'この端末ではクラウド接続が未設定です';
      counts.textContent = '端末内保存のまま利用できます。';
    } else if (!status.reachable || status.state === 'error') {
      summary.textContent = 'クラウドへ接続できませんでした';
      counts.textContent = '端末内のメニューと履歴には影響ありません。';
    } else {
      summary.textContent = status.label?.startsWith('再ログイン') ? 'もう一度ログインしてください' : '接続済み・未ログイン';
      counts.textContent = 'ログインすると、対象データの件数だけを確認します。';
    }

    loginButton.hidden = isSignedIn;
    loginButton.disabled = isChecking || !status.configured || !status.reachable;
    loginButton.textContent = status.state === 'link-sent' ? 'メールをもう一度送る' : 'クラウドへログイン';
    verifyButton.hidden = !isSignedIn;
    verifyButton.disabled = isChecking;
    logoutButton.hidden = !isSignedIn;
    logoutButton.disabled = isChecking;
  }

  function friendlyCloudError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/email not confirmed/i.test(message)) return 'メールアドレスの確認がまだ完了していません。';
    if (/otp_expired|token.*expired|expired.*token/i.test(message)) return 'ログインリンクの有効期限が切れています。もう一度メールを送ってください。';
    if (/rate limit|too many requests/i.test(message)) return 'メールの送信回数が多いため、少し待ってからもう一度お試しください。';
    if (/failed to fetch|networkerror/i.test(message)) return '通信できませんでした。接続を確認してもう一度お試しください。';
    return message || 'クラウドを確認できませんでした。';
  }

  function setCloudLoginBusy(busy) {
    $('#cloudEmail').disabled = busy;
    $('#cloudMagicLink').disabled = busy;
    $('#submitCloudLogin').disabled = busy;
    $('#verifyCloudMagicLink').disabled = busy;
    $('#cancelCloudLogin').disabled = busy;
    $('#submitCloudLogin').textContent = busy ? '送信中…' : 'ログイン用メールを送る';
  }

  function setCloudLoginMessage(message, success = false) {
    const statusElement = $('#cloudLoginStatus');
    statusElement.textContent = message;
    statusElement.classList.toggle('is-success', success);
  }

  function openCloudLoginDialog() {
    const currentStatus = window.HidakaSupabase?.getStatus?.() || {};
    if (!currentStatus.configured || !currentStatus.reachable) {
      $('#cloudActionStatus').textContent = 'クラウド接続の確認が完了していません。';
      return;
    }
    $('#cloudLoginForm').reset();
    setCloudLoginMessage('');
    setCloudLoginBusy(false);
    $('#cloudLoginDialog').showModal();
    $('#cloudEmail').focus();
  }

  async function submitCloudLogin(event) {
    event.preventDefault();
    if (!window.HidakaSupabase?.sendMagicLink) return;
    const email = $('#cloudEmail').value;
    setCloudLoginBusy(true);
    setCloudLoginMessage('ログイン用メールを送信しています。');
    try {
      const nextStatus = await window.HidakaSupabase.sendMagicLink(email);
      renderSupabaseStatus(nextStatus);
      setCloudLoginMessage('メールを送信しました。届いたログインリンクをコピーして、下の欄へ貼り付けてください。', true);
      $('#cloudActionStatus').textContent = 'ログイン用メールを送信しました。保存先は端末内のままです。';
    } catch (error) {
      setCloudLoginMessage(friendlyCloudError(error));
    } finally {
      setCloudLoginBusy(false);
    }
  }

  async function verifyCloudMagicLink() {
    if (!window.HidakaSupabase?.verifyMagicLink) return;
    const magicLink = $('#cloudMagicLink').value.trim();
    setCloudLoginBusy(true);
    setCloudLoginMessage('リンクを確認して、日高のデータを読み取っています。');
    try {
      const nextStatus = await window.HidakaSupabase.verifyMagicLink(magicLink);
      renderSupabaseStatus(nextStatus);
      $('#cloudActionStatus').textContent = 'クラウドへログインし、日高のデータを読み取り確認しました。保存先は端末内のままです。';
      $('#cloudLoginForm').reset();
      $('#cloudLoginDialog').close();
    } catch (error) {
      setCloudLoginMessage(friendlyCloudError(error));
    } finally {
      $('#cloudMagicLink').value = '';
      setCloudLoginBusy(false);
    }
  }

  async function verifyCloudRead() {
    if (!window.HidakaSupabase?.verifyRead) return;
    $('#cloudActionStatus').textContent = 'クラウドデータを読み取り確認しています。';
    try {
      const nextStatus = await window.HidakaSupabase.verifyRead();
      renderSupabaseStatus(nextStatus);
      $('#cloudActionStatus').textContent = 'もう一度読み取り確認しました。保存先は端末内のままです。';
    } catch (error) {
      $('#cloudActionStatus').textContent = friendlyCloudError(error);
      renderSupabaseStatus(window.HidakaSupabase.getStatus());
    }
  }

  async function logoutCloud() {
    if (!window.HidakaSupabase?.signOut) return;
    $('#cloudActionStatus').textContent = 'ログアウトしています。';
    try {
      const nextStatus = await window.HidakaSupabase.signOut();
      renderSupabaseStatus(nextStatus);
      $('#cloudActionStatus').textContent = 'この端末のクラウドログインを解除しました。';
    } catch (error) {
      $('#cloudActionStatus').textContent = friendlyCloudError(error);
    }
  }

  async function initializeSupabaseStatus() {
    if (!window.HidakaSupabase?.initialize) {
      renderSupabaseStatus({ state: 'not-configured', label: '未設定（保存は端末）' });
      return;
    }
    renderSupabaseStatus({ state: 'checking', label: '確認中（保存は端末）' });
    renderSupabaseStatus(await window.HidakaSupabase.initialize());
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
    const [loadedStores, loadedDefault] = await Promise.all([loadDefaultStores(), loadDefaultMenu()]);
    defaultStores = loadedStores;
    defaultMenu = loadedDefault.menu;
    activeDefaultMenuVersion = loadedDefault.version;
    state = loadState();
    init();
    void initializeSupabaseStatus();
    setupInstallPrompt();
    registerServiceWorker();
  }

  boot();
})();
