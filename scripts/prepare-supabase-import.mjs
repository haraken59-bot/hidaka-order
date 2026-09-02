import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BACKUP_FORMAT = 'hidaka-order-full-backup';
const DEFAULT_STORE = { id: 'hidaka-001', name: 'やきとり日高', area: '', memo: '' };
const DEFAULT_BUDGET = 3000;
const DEFAULT_FIXED_CHARGE = { name: '割代（焼酎キープ）', amount: 220 };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = new Set(['drink', 'small', 'skewer', 'main', 'finish', 'dessert', 'fee']);
const VALID_SOURCES = new Set(['recommended', 'manual', 'changed', 'fixed', 'legacy']);
const CATEGORY_ALIASES = {
  'お酒': 'drink', '飲み物': 'drink',
  '小皿': 'small', '小皿・つまみ': 'small', 'つまみ': 'small',
  '串': 'skewer', '焼き鳥': 'skewer',
  '一品': 'main', '主菜': 'main',
  '締め': 'finish', 'ご飯': 'finish',
  'デザート': 'dessert', '甘味': 'dessert'
};
const TAG_ALIASES = {
  pork: '豚', '豚': '豚', chicken: '鶏', '鶏': '鶏', beef: '牛', '牛': '牛',
  seafood: '魚介', '魚介': '魚介', vegetable: '野菜', '野菜': '野菜',
  spicy: '辛いもの', '辛いもの': '辛いもの', light: '軽め', '軽め': '軽め',
  drink: '飲み物', '飲み物': '飲み物', finish: '締め', '締め': '締め',
  rice: 'ご飯', 'ご飯': 'ご飯', noodle: '麺', '麺': '麺', soup: '汁物', '汁物': '汁物',
  dessert: 'デザート', 'デザート': 'デザート', sweet: '甘いもの', '甘いもの': '甘いもの',
  alcohol: 'アルコール', 'アルコール': 'アルコール',
  nonalcohol: 'ノンアルコール', 'ノンアルコール': 'ノンアルコール',
  shishito: 'ししとう', 'ししとう': 'ししとう'
};
const SEASON_ALIASES = {
  spring: 'spring', '春': 'spring', summer: 'summer', '夏': 'summer',
  autumn: 'autumn', fall: 'autumn', '秋': 'autumn', winter: 'winter', '冬': 'winter'
};

function fail(message) {
  throw new Error(message);
}

function text(value) {
  return String(value ?? '').trim();
}

function finiteInteger(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === '') return null;
  const normalized = text(value).toLowerCase();
  if (['true', '1', 'yes', 'on', 'はい', 'あり', '利用'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'いいえ', 'なし', '未利用'].includes(normalized)) return false;
  return null;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableTextId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 20)}`;
}

function stableUuid(value) {
  const hex = sha256(value).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function validDate(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function validIso(value, fallback) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function todayInJapan() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function normalizedName(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : text(value).split(/[|,、]/);
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeTags(value) {
  return normalizeStringArray(value).map(tag => TAG_ALIASES[tag.toLowerCase()] ?? TAG_ALIASES[tag] ?? tag);
}

function normalizeSeasons(value) {
  return [...new Set(normalizeStringArray(value).map(season => SEASON_ALIASES[season.toLowerCase()] ?? SEASON_ALIASES[season]).filter(Boolean))];
}

function normalizeCategory(value) {
  const normalized = text(value || 'small').toLowerCase();
  const category = VALID_CATEGORIES.has(normalized) ? normalized : CATEGORY_ALIASES[normalized];
  return category || 'small';
}

function normalizeOfferingType(value) {
  const normalized = text(value).toLowerCase();
  if (['regular', 'seasonal', 'limited'].includes(normalized)) return normalized;
  return { '通常': 'regular', '通常メニュー': 'regular', '季節': 'seasonal', '季節メニュー': 'seasonal', '期間限定': 'limited', '期間限定メニュー': 'limited' }[normalized] || 'regular';
}

function normalizeAvailable(raw) {
  const value = raw.available ?? raw['提供中'] ?? raw['提供状態'];
  if (value === undefined || value === null || value === '') return true;
  if (value === false) return false;
  return !['false', '0', '休止', '休止中', '停止', '提供休止'].includes(text(value).toLowerCase());
}

function normalizeActual(raw) {
  const value = raw.actual ?? raw['実額'] ?? raw['実売価格'];
  return value === true || ['true', '1'].includes(text(value).toLowerCase());
}

function normalizeStore(raw, generatedAt) {
  const id = text(raw?.id ?? raw?.storeId ?? raw?.['店舗ID']);
  const name = text(raw?.name ?? raw?.['店名'] ?? raw?.['店舗名']);
  if (!id || !name) return null;
  return {
    id,
    name,
    area: text(raw.area ?? raw['エリア']),
    memo: text(raw.memo ?? raw['メモ']),
    is_active: true,
    created_at: generatedAt,
    updated_at: generatedAt,
    deleted_at: null
  };
}

function normalizeStoreLinks(rawSelection, sourceStores, generatedAt) {
  const entries = Array.isArray(rawSelection?.links) ? rawSelection.links : [rawSelection];
  const sourceStoreIds = new Set(sourceStores.map(store => store.id));
  const links = entries.map((entry, index) => {
    const appKey = text(entry?.appKey ?? entry?.app_key);
    const legacyStoreId = text(entry?.legacyStoreId ?? entry?.legacy_store_id);
    const storeId = text(entry?.supabaseStoreId ?? entry?.storeId ?? entry?.store_id);
    if (!appKey) fail(`店舗選択${index + 1}件目のappKeyがありません`);
    if (!legacyStoreId || !sourceStoreIds.has(legacyStoreId)) {
      fail(`店舗選択${index + 1}件目の旧店舗IDがバックアップ内にありません: ${legacyStoreId || '未指定'}`);
    }
    if (!UUID_PATTERN.test(storeId)) fail(`店舗選択${index + 1}件目のSupabase店舗IDがUUIDではありません`);
    return {
      app_key: appKey,
      legacy_store_id: legacyStoreId,
      store_id: storeId,
      created_at: generatedAt,
      updated_at: generatedAt
    };
  });
  assertUnique(links, link => `${link.app_key}|${link.legacy_store_id}`, '店舗対応');
  assertUnique(links, link => `${link.app_key}|${link.store_id}`, '店舗対応先');
  return links;
}

function normalizeMenu(raw, index, generatedAt) {
  const name = text(raw?.name ?? raw?.['料理名'] ?? raw?.['メニュー名']);
  const price = finiteInteger(raw?.price ?? raw?.['価格'] ?? raw?.['値段']);
  if (!name || price === null || price < 0) fail(`メニュー${index + 1}件目の名前または価格が不正です`);
  const storeId = text(raw.storeId ?? raw['店舗ID']) || DEFAULT_STORE.id;
  const id = text(raw.id ?? raw.ID ?? raw['メニューID']) || stableTextId('legacy-menu', `${storeId}|${name}|${index}`);
  const offeringType = normalizeOfferingType(raw.offeringType ?? raw['提供区分']);
  const updatedAt = validIso(raw.updatedAt ?? raw['最終更新日'], generatedAt);
  return {
    id,
    store_id: storeId,
    name,
    category: normalizeCategory(raw.category ?? raw['分類']),
    price,
    tags: normalizeTags(raw.tags ?? raw['タグ']),
    is_actual_price: normalizeActual(raw),
    is_available: normalizeAvailable(raw),
    recommendation_type: 'normal',
    offering_type: offeringType,
    seasons: offeringType === 'seasonal' ? normalizeSeasons(raw.seasons ?? raw['季節']) : [],
    available_from: offeringType === 'regular' ? null : validDate(raw.availableFrom ?? raw['提供開始日']),
    available_until: offeringType === 'regular' ? null : validDate(raw.availableUntil ?? raw['提供終了日']),
    memo: text(raw.memo ?? raw['メモ']),
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null
  };
}

function createMenuLookup(menuItems) {
  const lookup = new Map();
  for (const item of menuItems) {
    lookup.set(`${item.store_id}|${normalizedName(item.name)}`, item);
    if (!lookup.has(normalizedName(item.name))) lookup.set(normalizedName(item.name), item);
  }
  return lookup;
}

function findMenu(lookup, storeId, name, menuId = '') {
  if (menuId) {
    for (const item of lookup.values()) if (item.store_id === storeId && item.id === menuId) return item;
  }
  return lookup.get(`${storeId}|${normalizedName(name)}`) || lookup.get(normalizedName(name)) || null;
}

function normalizeContext(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const budget = finiteInteger(source.budget ?? source['予算']);
  const hungerRaw = text(source.hunger ?? source['空腹度']).toLowerCase();
  const hunger = ['light', 'normal', 'hearty'].includes(hungerRaw)
    ? hungerRaw
    : ({ '軽め': 'light', '普通': 'normal', 'しっかり': 'hearty', 'がっつり': 'hearty' }[hungerRaw] || null);
  const stageRaw = text(source.visitStage ?? source['来店段階']).toLowerCase();
  const visitStage = ['first', 'second', 'other'].includes(stageRaw)
    ? stageRaw
    : ({ '1軒目': 'first', '一軒目': 'first', '2軒目': 'second', '二軒目': 'second' }[stageRaw] || null);
  const skewerCountValue = finiteInteger(source.skewerCount ?? source['串本数']);
  const stayDurationValue = finiteInteger(source.stayDurationMinutes ?? source['滞在時間（分）']);
  return {
    budget: budget !== null && budget >= 0 ? budget : null,
    hunger,
    skewer_count: skewerCountValue !== null && skewerCountValue >= 0 ? Math.min(10, skewerCountValue) : null,
    moods: normalizeStringArray(source.moods ?? source['今日の気分'] ?? source['食べたいジャンル']).map(value => value.toLowerCase()),
    starting_drink_menu_id: text(source.startingDrinkId ?? source['開始飲み物ID']) || null,
    starting_drink_name: text(source.startingDrinkName ?? source['最初の飲み物']),
    must_shishito: booleanOrNull(source.mustShishito ?? source['ししとう必須']),
    want_finish: booleanOrNull(source.wantFinish ?? source['締め希望']),
    avoid_recent: booleanOrNull(source.avoidRecent ?? source['最近の重複回避']),
    shochu_keep_used: booleanOrNull(source.shochuKeepUsed ?? source['焼酎キープ利用']),
    visit_stage: visitStage,
    plans_second_venue: booleanOrNull(source.plansSecondVenue ?? source['2軒目予定']),
    seafood_requested: booleanOrNull(source.seafoodRequested ?? source['魚介希望']),
    meat_requested: booleanOrNull(source.meatRequested ?? source['肉希望']),
    seasonal_requested: booleanOrNull(source.seasonalRequested ?? source['旬のもの希望']),
    stay_duration_minutes: stayDurationValue !== null && stayDurationValue >= 0 ? stayDurationValue : null,
    other_wishes: text(source.otherWishes ?? source['その他の希望'])
  };
}

function normalizeFeedback(raw, visitId, generatedAt) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const satisfactionValue = finiteInteger(source.satisfaction ?? source['満足度']);
  const satisfaction = satisfactionValue >= 1 && satisfactionValue <= 5 ? satisfactionValue : null;
  let wouldOrderAgain = booleanOrNull(source.wouldOrderAgain ?? source['また頼みたい']);
  let avoidNextTime = booleanOrNull(source.avoidNextTime ?? source['次回は避けたい']);
  const repeat = text(source.repeatPreference ?? source['次回意向']).toLowerCase();
  if (repeat === 'again') { wouldOrderAgain = true; avoidNextTime = false; }
  if (repeat === 'avoid') { wouldOrderAgain = false; avoidNextTime = true; }
  if (repeat === 'none') { wouldOrderAgain = false; avoidNextTime = false; }
  if (wouldOrderAgain === true && avoidNextTime === true) avoidNextTime = false;
  const amountRaw = text(source.amount ?? source['量']).toLowerCase();
  const amountFeeling = ['small', 'just', 'large'].includes(amountRaw)
    ? amountRaw
    : ({ '少ない': 'small', 'ちょうどよい': 'just', 'ちょうど良い': 'just', '多い': 'large' }[amountRaw] || null);
  const priceRaw = text(source.priceFeeling ?? source['金額感']).toLowerCase();
  const priceFeeling = ['cheap', 'fair', 'expensive'].includes(priceRaw)
    ? priceRaw
    : ({ '安い': 'cheap', '適切': 'fair', '高い': 'expensive' }[priceRaw] || null);
  const comment = text(source.comment ?? source['コメント']).slice(0, 300);
  const hasValue = satisfaction !== null || wouldOrderAgain !== null || avoidNextTime !== null || amountFeeling || priceFeeling || comment;
  if (!hasValue) return null;
  const updatedAt = validIso(source.updatedAt ?? source['更新日時'], generatedAt);
  return {
    visit_id: visitId,
    satisfaction,
    would_order_again: wouldOrderAgain,
    avoid_next_time: avoidNextTime,
    amount_feeling: amountFeeling,
    price_feeling: priceFeeling,
    comment,
    created_at: updatedAt,
    updated_at: updatedAt
  };
}

function normalizeHistory(history, menuItems, backupMeta) {
  const menuLookup = createMenuLookup(menuItems);
  const visits = [];
  const recommendationRuns = [];
  const recommendationItems = [];
  const orderItems = [];
  const visitFeedback = [];

  history.forEach((raw, historyIndex) => {
    if (!raw || typeof raw !== 'object') fail(`履歴${historyIndex + 1}件目が不正です`);
    const visitedAtInput = text(raw.visitedAt ?? raw['来店日時']);
    const date = validDate(text(raw.date ?? raw['日付'] ?? visitedAtInput).slice(0, 10));
    if (!date) fail(`履歴${historyIndex + 1}件目の日付が不正です`);
    const rawOrder = raw.items ?? raw.order ?? raw['注文'] ?? raw['注文内容'];
    const rawItems = Array.isArray(rawOrder)
      ? rawOrder
      : text(rawOrder).split(/[|｜]/).map(name => ({ name })).filter(item => text(item.name));
    if (!rawItems.length) fail(`履歴${historyIndex + 1}件目に商品がありません`);
    const storeId = text(raw.storeId ?? raw['店舗ID']) || DEFAULT_STORE.id;
    const historyId = text(raw.id ?? raw.orderHistoryId ?? raw['注文履歴ID'])
      || stableTextId('history', `${date}|${historyIndex}|${rawItems.map(item => text(item.name ?? item)).join('|')}`);
    const visitId = text(raw.visitId ?? raw['来店ID']) || `visit-${historyId}`;
    const hasVisitTime = /^\d{4}-\d{2}-\d{2}T/.test(visitedAtInput) && Number.isFinite(new Date(visitedAtInput).getTime());
    const visitedAt = hasVisitTime ? validIso(visitedAtInput, `${date}T00:00:00.000Z`) : `${date}T00:00:00+09:00`;
    const recordedAt = validIso(raw.recordedAt ?? raw['記録日時'], backupMeta.exportedAt);
    const context = normalizeContext(raw.context ?? raw['状況']);
    const startingDrink = findMenu(menuLookup, storeId, context.starting_drink_name, context.starting_drink_menu_id || '');
    context.starting_drink_menu_id = startingDrink?.id || null;
    context.starting_drink_name = context.starting_drink_name || startingDrink?.name || '';
    const normalizedLines = rawItems.map((line, lineIndex) => {
      const source = typeof line === 'string' ? { name: line } : (line || {});
      const name = text(source.name ?? source['料理名'] ?? source['メニュー名']);
      if (!name) fail(`履歴${historyIndex + 1}件目の商品${lineIndex + 1}件目に名前がありません`);
      const menu = findMenu(menuLookup, storeId, name, text(source.menuId ?? source['メニューID']));
      const orderIndex = Math.max(1, finiteInteger(source.orderIndex ?? source['注文順'], lineIndex + 1));
      const quantity = Math.max(1, finiteInteger(source.quantity ?? source['数量'], 1));
      const unitPrice = finiteInteger(source.unitPrice ?? source.price ?? source['注文時価格'] ?? source['価格']);
      const rawSource = text(source.source ?? source['追加区分'] ?? (source.manuallyAdded ? 'manual' : 'legacy')).toLowerCase();
      const aiSuggestion = source.aiSuggestion ?? source['AI提案'];
      const isFixedCharge = normalizedName(name) === normalizedName(DEFAULT_FIXED_CHARGE.name);
      const selectionSource = isFixedCharge
        ? 'fixed'
        : (aiSuggestion ? 'changed' : (VALID_SOURCES.has(rawSource) ? rawSource : 'legacy'));
      return {
        raw: source,
        id: text(source.lineId ?? source['注文明細ID']) || `${historyId}-line-${orderIndex}`,
        visit_id: visitId,
        menu_id: menu?.id || null,
        menu_name: name,
        order_index: orderIndex,
        quantity,
        unit_price: unitPrice !== null && unitPrice >= 0 ? unitPrice : null,
        subtotal: unitPrice !== null && unitPrice >= 0 ? unitPrice * quantity : null,
        source: selectionSource,
        recommendation_reason: text(source.recommendationReason ?? source['選定理由']),
        change_reason: text(source.changeReason ?? source['変更理由']),
        aiSuggestion
      };
    }).sort((a, b) => a.order_index - b.order_index);

    const totalInput = finiteInteger(raw.total ?? raw['会計金額']);
    const canCalculate = normalizedLines.every(line => line.subtotal !== null);
    const calculatedTotal = canCalculate ? normalizedLines.reduce((sum, line) => sum + line.subtotal, 0) : null;
    const totalAmount = totalInput !== null && totalInput >= 0 ? totalInput : calculatedTotal;
    visits.push({
      id: visitId,
      order_history_id: historyId,
      store_id: storeId,
      visited_at: visitedAt,
      visit_time_known: raw.visitTimeKnown === true || hasVisitTime,
      recorded_at: recordedAt,
      ...context,
      total_amount: totalAmount,
      memo: text(raw.memo ?? raw['メモ']),
      created_at: recordedAt,
      updated_at: recordedAt,
      deleted_at: null
    });

    const changedLines = normalizedLines.filter(line => line.aiSuggestion && typeof line.aiSuggestion === 'object');
    let recommendationRunId = null;
    if (changedLines.length) {
      recommendationRunId = stableUuid(`recommendation-run|${visitId}`);
      recommendationRuns.push({
        id: recommendationRunId,
        store_id: storeId,
        visit_id: visitId,
        generated_at: recordedAt,
        algorithm_version: backupMeta.appVersion || 'legacy-import',
        conditions: context,
        estimated_total: null,
        notices: ['旧履歴から復元した変更前提案']
      });
    }

    for (const line of normalizedLines) {
      let recommendationItemId = null;
      if (recommendationRunId && line.aiSuggestion && typeof line.aiSuggestion === 'object') {
        const suggestionName = text(line.aiSuggestion.name ?? line.aiSuggestion['メニュー名']);
        if (suggestionName) {
          const suggestionMenu = findMenu(menuLookup, storeId, suggestionName, text(line.aiSuggestion.menuId ?? line.aiSuggestion.id ?? line.aiSuggestion['メニューID']));
          const suggestionPrice = finiteInteger(line.aiSuggestion.price ?? line.aiSuggestion.unitPrice ?? line.aiSuggestion['提案時価格']);
          recommendationItemId = stableUuid(`recommendation-item|${line.id}`);
          recommendationItems.push({
            id: recommendationItemId,
            recommendation_run_id: recommendationRunId,
            menu_id: suggestionMenu?.id || null,
            menu_name: suggestionName,
            order_index: line.order_index,
            quantity: line.quantity,
            unit_price: suggestionPrice !== null && suggestionPrice >= 0 ? suggestionPrice : null,
            recommendation_reason: text(line.aiSuggestion.recommendationReason ?? line.aiSuggestion['選定理由'])
          });
        }
      }
      orderItems.push({
        id: line.id,
        visit_id: line.visit_id,
        menu_id: line.menu_id,
        menu_name: line.menu_name,
        order_index: line.order_index,
        quantity: line.quantity,
        unit_price: line.unit_price,
        subtotal: line.subtotal,
        source: line.source,
        recommendation_reason: line.recommendation_reason,
        source_recommendation_item_id: recommendationItemId,
        change_reason: line.change_reason,
        created_at: recordedAt,
        updated_at: recordedAt,
        deleted_at: null
      });
    }

    const feedback = normalizeFeedback(raw.feedback ?? raw['フィードバック'], visitId, recordedAt);
    if (feedback) visitFeedback.push(feedback);
  });

  return { visits, recommendationRuns, recommendationItems, orderItems, visitFeedback };
}

function assertUnique(rows, key, label) {
  const values = rows.map(row => key(row));
  if (new Set(values).size !== values.length) fail(`${label}に重複IDがあります`);
}

function validateRelations(tables) {
  const storeIds = new Set(tables.app_store_links.map(link => link.store_id));
  const menuIds = new Set(tables.menu_items.map(item => item.id));
  const visitIds = new Set(tables.visits.map(visit => visit.id));
  const runIds = new Set(tables.recommendation_runs.map(run => run.id));
  const recommendationItemIds = new Set(tables.recommendation_items.map(item => item.id));

  for (const item of tables.menu_items) if (!storeIds.has(item.store_id)) fail('店舗がないメニューがあります');
  for (const status of tables.daily_menu_status) {
    if (!storeIds.has(status.store_id) || !menuIds.has(status.menu_id)) fail('品切れの店舗またはメニューがありません');
  }
  for (const visit of tables.visits) if (!storeIds.has(visit.store_id)) fail('店舗がない来店があります');
  for (const run of tables.recommendation_runs) {
    if (!storeIds.has(run.store_id) || (run.visit_id && !visitIds.has(run.visit_id))) fail('AI提案の店舗または来店がありません');
  }
  for (const item of tables.recommendation_items) {
    if (!runIds.has(item.recommendation_run_id) || (item.menu_id && !menuIds.has(item.menu_id))) fail('AI提案商品の親データがありません');
  }
  for (const item of tables.order_items) {
    if (!visitIds.has(item.visit_id)) fail('注文明細の来店がありません');
    if (item.menu_id && !menuIds.has(item.menu_id)) fail('注文明細のメニューがありません');
    if (item.source_recommendation_item_id && !recommendationItemIds.has(item.source_recommendation_item_id)) fail('注文明細の元AI提案がありません');
  }
  for (const feedback of tables.visit_feedback) if (!visitIds.has(feedback.visit_id)) fail('感想の来店がありません');

  for (const visit of tables.visits) {
    const lines = tables.order_items.filter(item => item.visit_id === visit.id && item.deleted_at === null);
    const orderIndexes = lines.map(line => line.order_index);
    if (new Set(orderIndexes).size !== orderIndexes.length) fail(`来店ID ${visit.id} の注文順が重複しています`);
    if (visit.total_amount !== null && lines.every(line => line.subtotal !== null)) {
      const calculated = lines.reduce((sum, line) => sum + line.subtotal, 0);
      if (calculated !== visit.total_amount) fail(`来店ID ${visit.id} の合計金額が一致しません`);
    }
  }
}

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('使い方: node scripts/prepare-supabase-import.mjs <完全バックアップ.json> [出力フォルダー] [店舗選択.json]');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputDir = path.resolve(process.argv[3] || path.join('supabase', 'private-import'));
const storeSelectionPath = path.resolve(process.argv[4] || path.join(outputDir, 'store-selection.json'));
const sourceText = await readFile(inputPath, 'utf8');
const backup = JSON.parse(sourceText);
const storeSelection = JSON.parse(await readFile(storeSelectionPath, 'utf8'));

if (backup?.format !== BACKUP_FORMAT) fail('日高オーダーの完全バックアップではありません');
const schemaVersion = finiteInteger(backup.schemaVersion);
if (schemaVersion === null || schemaVersion < 1 || schemaVersion > 6) fail(`未対応のバックアップ形式です: ${backup.schemaVersion}`);
const data = backup.data;
if (!data || !Array.isArray(data.menu) || !Array.isArray(data.initialMenu) || !Array.isArray(data.history)) {
  fail('バックアップに必要なメニュー・初期メニュー・履歴がありません');
}

const generatedAt = new Date().toISOString();
const exportedAt = validIso(backup.exportedAt, generatedAt);
const rawStores = Array.isArray(data.stores) ? data.stores : [];
const stores = rawStores.map(store => normalizeStore(store, generatedAt)).filter(Boolean);
if (!stores.length) stores.push(normalizeStore(DEFAULT_STORE, generatedAt));
const appStoreLinks = normalizeStoreLinks(storeSelection, stores, generatedAt);
const supabaseStoreIdByLegacyId = new Map(appStoreLinks.map(link => [link.legacy_store_id, link.store_id]));
const menuItems = data.menu.map((item, index) => normalizeMenu(item, index, exportedAt));
const storeIds = new Set(stores.map(store => store.id));
for (const item of menuItems) if (!storeIds.has(item.store_id)) fail(`メニュー「${item.name}」の店舗IDが店舗データにありません`);

assertUnique(stores, store => store.id, '店舗');
assertUnique(menuItems, item => item.id, 'メニュー');

const source = backup.source && typeof backup.source === 'object' ? backup.source : {};
const backupMeta = { exportedAt, appVersion: text(source.appVersion) };
const historyTables = normalizeHistory(data.history, menuItems, backupMeta);
assertUnique(historyTables.visits, visit => visit.id, '来店');
assertUnique(historyTables.orderItems, item => item.id, '注文明細');

const preferences = data.preferences && typeof data.preferences === 'object' ? data.preferences : {};
const activeStoreId = text(data.activeStoreId ?? source.storeId) || stores[0].id;
if (!storeIds.has(activeStoreId)) fail('選択中の店舗IDが店舗データにありません');
const defaultHunger = ['light', 'normal', 'hearty'].includes(text(preferences.hunger).toLowerCase()) ? text(preferences.hunger).toLowerCase() : 'normal';
const storeSettings = [{
  store_id: activeStoreId,
  default_budget: DEFAULT_BUDGET,
  default_hunger: defaultHunger,
  default_skewer_count: Math.min(10, Math.max(0, finiteInteger(preferences.skewerCount, 3))),
  must_shishito: booleanOrNull(preferences.mustShishito) ?? true,
  avoid_recent_orders: true,
  recent_history_depth: 3,
  fixed_charge_name: DEFAULT_FIXED_CHARGE.name,
  fixed_charge_amount: DEFAULT_FIXED_CHARGE.amount,
  fixed_charge_position: 'last',
  hunger_dish_counts: { light: 1, normal: 2, hearty: 3 },
  extra_rules: {},
  updated_at: generatedAt
}];

const outOfStock = data.outOfStock && typeof data.outOfStock === 'object' ? data.outOfStock : {};
const outOfStockDate = validDate(outOfStock.date);
const today = todayInJapan();
const menuById = new Map(menuItems.map(item => [item.id, item]));
const dailyMenuStatus = outOfStockDate === today
  ? normalizeStringArray(outOfStock.ids).map(menuId => {
      const item = menuById.get(menuId);
      if (!item) fail(`品切れメニューID「${menuId}」がメニューにありません`);
      return {
        store_id: item.store_id,
        menu_id: item.id,
        service_date: today,
        status: 'sold_out',
        memo: '',
        created_at: generatedAt
      };
    })
  : [];

const remapStoreId = row => ({
  ...row,
  store_id: supabaseStoreIdByLegacyId.get(row.store_id) || fail(`店舗ID「${row.store_id}」の対応先がありません`)
});
const mappedMenuItems = menuItems.map(remapStoreId);
const mappedStoreSettings = storeSettings.map(remapStoreId);
const mappedDailyMenuStatus = dailyMenuStatus.map(remapStoreId);
const mappedVisits = historyTables.visits.map(remapStoreId);
const mappedRecommendationRuns = historyTables.recommendationRuns.map(remapStoreId);

const payload = {
  format: 'hidaka-order-supabase-import',
  version: 2,
  generated_at: generatedAt,
  owner_binding: 'authenticated-user-at-import',
  source: {
    backup_schema_version: schemaVersion,
    backup_exported_at: exportedAt,
    app_version: text(source.appVersion),
    sha256: sha256(sourceText)
  },
  tables: {
    app_store_links: appStoreLinks,
    menu_items: mappedMenuItems,
    store_settings: mappedStoreSettings,
    daily_menu_status: mappedDailyMenuStatus,
    visits: mappedVisits,
    recommendation_runs: mappedRecommendationRuns,
    recommendation_items: historyTables.recommendationItems,
    order_items: historyTables.orderItems,
    visit_feedback: historyTables.visitFeedback
  }
};

validateRelations(payload.tables);

const summary = {
  source_file: path.basename(inputPath),
  source_sha256: payload.source.sha256,
  backup_schema_version: schemaVersion,
  backup_exported_at: exportedAt,
  generated_at: generatedAt,
  store_selection_file: path.basename(storeSelectionPath),
  store_links: appStoreLinks.map(link => ({
    app_key: link.app_key,
    legacy_store_id: link.legacy_store_id,
    store_id: link.store_id
  })),
  counts: Object.fromEntries(Object.entries(payload.tables).map(([table, rows]) => [table, rows.length])),
  validation: {
    passed: true,
    order_items_with_known_price: historyTables.orderItems.filter(item => item.unit_price !== null).length,
    visit_totals_checked: historyTables.visits.filter(visit => visit.total_amount !== null).length
  },
  initial_menu_count_not_uploaded: data.initialMenu.length,
  pending_order_kept_local: Boolean(data.pendingOrder),
  out_of_stock: outOfStockDate === today
    ? `当日分${dailyMenuStatus.length}件を準備`
    : `対象外（保存日${outOfStockDate || '不明'}、変換日${today}）`
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'supabase-import.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'import-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(summary, null, 2));
