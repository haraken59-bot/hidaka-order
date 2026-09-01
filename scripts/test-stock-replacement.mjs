import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appPath = new URL('../app.js', import.meta.url);
const source = readFileSync(appPath, 'utf8');
const instrumented = source.replace(
  /\n\s*boot\(\);\s*\n\}\)\(\);\s*$/,
  '\n  globalThis.__hidakaTest = { replaceOutOfStockItems, replaceOrderItemManually, regenerateOrderKeepingManualItems, normalizePendingOrder, normalizeHistoryItem, normalizeVisitContext, createVisitContext, createHistoryRecord, normalizeStore, normalizeStores, normalizeMenuItem, normalizeDefaultMenuRows, compareMenuEditorItems, compareMenuEditorItemsByCategory, buildMenuCsv, mergeImportedData, createFullBackupPayload, normalizeFullBackup, setState: value => { state = value; }, getState: () => state };\n})();\n'
);
assert.notEqual(instrumented, source, 'app.js のテスト準備に失敗しました。');

const context = vm.createContext({ console });
vm.runInContext(instrumented, context, { filename: 'app.js' });
const test = context.__hidakaTest;

const stableIdItem = test.normalizeMenuItem({ メニューID: 'base-001', 料理名: '固定ID確認', 価格: 100, 分類: '小皿', タグ: '軽め', 実額: true });
assert.equal(stableIdItem.id, 'base-001');
assert.equal(stableIdItem.storeId, 'hidaka-001');
assert.equal(stableIdItem.available, true);
assert.equal(stableIdItem.offeringType, 'regular');
assert.deepEqual(Array.from(stableIdItem.seasons), []);
assert.equal(stableIdItem.availableFrom, '');
assert.equal(stableIdItem.availableUntil, '');
const pausedCsvItem = test.normalizeMenuItem({ メニューID: 'base-002', 店舗ID: 'hidaka-001', 料理名: '休止確認', 価格: 200, 分類: '小皿', タグ: '', 実額: true, 提供状態: '休止中' });
assert.equal(pausedCsvItem.available, false);
const seasonalCsvItem = test.normalizeMenuItem({ メニューID: 'base-003', 店舗ID: 'hidaka-001', 料理名: '季節確認', 価格: 300, 分類: '小皿', タグ: '魚介', 実額: true, 提供状態: '提供中', 提供区分: '季節', 季節: '春|夏', 提供開始日: '2026-03-01', 提供終了日: '2026-08-31', メモ: '確認用', 最終更新日: '2026-03-01T10:00:00.000Z' });
assert.equal(seasonalCsvItem.offeringType, 'seasonal');
assert.deepEqual(Array.from(seasonalCsvItem.seasons), ['spring', 'summer']);
assert.equal(seasonalCsvItem.availableFrom, '2026-03-01');
assert.equal(seasonalCsvItem.availableUntil, '2026-08-31');
assert.equal(seasonalCsvItem.memo, '確認用');
assert.match(test.buildMenuCsv([stableIdItem, pausedCsvItem, seasonalCsvItem]), /^メニューID,店舗ID,料理名,価格,分類,タグ,実額,提供状態,提供区分,季節,提供開始日,提供終了日,メモ,最終更新日\nbase-001,hidaka-001,[^\n]+,提供中,通常,,,,,\nbase-002,hidaka-001,[^\n]+,休止中,通常,,,,,\nbase-003,hidaka-001,[^\n]+,提供中,季節,春\|夏,2026-03-01,2026-08-31,確認用,2026-03-01T10:00:00.000Z\n$/);
test.setState({ menu: [seasonalCsvItem], history: [] });
test.mergeImportedData([{ 店舗ID: 'hidaka-001', 料理名: seasonalCsvItem.name, 価格: 350, 分類: '小皿', タグ: '魚介', 実額: true }], 'menu', 'merge');
assert.equal(test.getState().menu[0].price, 350);
assert.equal(test.getState().menu[0].offeringType, 'seasonal');
assert.deepEqual(Array.from(test.getState().menu[0].seasons), ['spring', 'summer']);
assert.equal(test.getState().menu[0].availableFrom, '2026-03-01');
const normalizedStore = test.normalizeStore({ 店舗ID: 'hidaka-001', 店名: 'やきとり日高', エリア: '', メモ: '' });
assert.equal(normalizedStore.id, 'hidaka-001');
assert.equal(normalizedStore.name, 'やきとり日高');
assert.equal(normalizedStore.area, '');
assert.equal(normalizedStore.memo, '');
assert.equal(test.normalizeStores([{ id: 'duplicate', name: '店舗1' }, { id: 'duplicate', name: '店舗2' }]).length, 0);
const tagSortedMenu = [
  { name: 'タグなし', tags: [], available: true },
  { name: '野菜料理', tags: ['野菜'], available: true },
  { name: '魚介料理', tags: ['魚介', '軽め'], available: true },
  { name: '豚料理', tags: ['豚'], available: true }
].sort(test.compareMenuEditorItems);
assert.deepEqual(Array.from(tagSortedMenu, item => item.name), ['豚料理', '魚介料理', '野菜料理', 'タグなし']);
const categorySortedMenu = [
  { name: '締め料理', category: 'finish', tags: [], available: true },
  { name: '小皿料理', category: 'small', tags: [], available: true },
  { name: '飲み物', category: 'drink', tags: [], available: true }
].sort(test.compareMenuEditorItemsByCategory);
assert.deepEqual(Array.from(categorySortedMenu, item => item.name), ['飲み物', '小皿料理', '締め料理']);
const reorderedDefaults = test.normalizeDefaultMenuRows([
  { メニューID: 'fixed-b', 料理名: '二番目から移動', 価格: 200, 分類: '小皿', タグ: '', 実額: true },
  { メニューID: 'fixed-a', 料理名: '一番目から移動', 価格: 100, 分類: '小皿', タグ: '', 実額: true }
]);
assert.equal(reorderedDefaults.map(item => item.id).join(','), 'fixed-b,fixed-a');
assert.throws(() => test.normalizeDefaultMenuRows([
  { メニューID: 'duplicate', 料理名: '重複1', 価格: 100 },
  { メニューID: 'duplicate', 料理名: '重複2', 価格: 200 }
]), /重複/);

const drink = { id: 'drink', name: '飲み物', price: 400, category: 'drink', tags: [], actual: true };
const small = { id: 'small', name: '小皿', price: 300, category: 'small', tags: [], actual: true };
const soldOut = { id: 'sold-out', name: '品切れ串', price: 200, category: 'skewer', tags: ['鶏'], actual: true };
const replacement = { id: 'replacement', name: '代わりの串', price: 180, category: 'skewer', tags: ['鶏'], actual: true };
const pausedReplacement = { id: 'paused-replacement', name: '休止中の代わり串', price: 200, category: 'skewer', tags: ['鶏'], actual: true, available: false };
const fee = { id: 'fee', name: '割代', price: 220, category: 'fee', tags: [], actual: true };
const preferences = { budget: 3000, hunger: 'normal', skewerCount: 1, drink: 'drink', moods: [], mustShishito: false, wantFinish: false, avoidRecent: false };
const originalOrder = { items: [drink, small, soldOut, fee], total: 1120, budget: 3000, unavailable: [], preferences, excludedIds: [] };

test.setState({ menu: [drink, small, soldOut, replacement], history: [] });
const replaced = test.replaceOutOfStockItems(originalOrder, ['sold-out'], ['sold-out']);
assert.equal(replaced.items.map(item => item.id).join(','), 'drink,small,replacement,fee');
assert.equal(replaced.total, 1100);
assert.match(replaced.unavailable.join('\n'), /「品切れ串」を「代わりの串」に変更しました/);

test.setState({ menu: [drink, small, soldOut, pausedReplacement], history: [] });
const pausedReplacementExcluded = test.replaceOutOfStockItems(originalOrder, ['sold-out'], ['sold-out']);
assert.equal(pausedReplacementExcluded.items.some(item => item.id === pausedReplacement.id), false);

test.setState({ menu: [drink, small, soldOut], history: [] });
const removed = test.replaceOutOfStockItems(originalOrder, ['sold-out'], ['sold-out']);
assert.equal(removed.items.map(item => item.id).join(','), 'drink,small,fee');
assert.equal(removed.total, 920);
assert.match(removed.unavailable.join('\n'), /この品だけ外しました/);

const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
const manuallyAdded = { id: 'manual', name: '手動追加料理', price: 500, category: 'main', tags: [], actual: true, manuallyAdded: true };
const manualReplacement = { id: 'manual-replacement', name: '自分で選んだ料理', price: 450, category: 'main', tags: ['魚介'], actual: true };
const manuallyChangedOrder = test.replaceOrderItemManually(originalOrder, 1, manualReplacement, '今回は気分ではない');
assert.equal(manuallyChangedOrder.items[1].id, manualReplacement.id);
assert.equal(manuallyChangedOrder.items[1].manuallyChanged, true);
assert.equal(manuallyChangedOrder.items[1].changedFrom.menuId, small.id);
assert.equal(manuallyChangedOrder.items[1].changedFrom.name, small.name);
assert.equal(manuallyChangedOrder.items[1].changeReason, '今回は気分ではない');
assert.equal(manuallyChangedOrder.total, originalOrder.total - small.price + manualReplacement.price);
assert.equal(manuallyChangedOrder.excludedIds.length, 0);
test.setState({ menu: [small, replacement], history: [], outOfStock: { date: today, ids: [] } });
const regenerated = test.regenerateOrderKeepingManualItems({ ...originalOrder, items: [small, manuallyAdded], total: 800 }, { ...preferences, drink: 'none', skewerCount: 0 });
assert.equal(regenerated.items.filter(item => item.manuallyAdded).map(item => item.id).join(','), 'manual');
assert.equal(regenerated.total, regenerated.items.reduce((sum, item) => sum + item.price, 0));

test.setState({ menu: [small, manualReplacement], history: [], outOfStock: { date: today, ids: [] } });
const changedItemKept = test.regenerateOrderKeepingManualItems(manuallyChangedOrder, { ...preferences, drink: 'none', skewerCount: 0 });
assert.equal(changedItemKept.items.filter(item => item.manuallyChanged).map(item => item.id).join(','), manualReplacement.id);
assert.equal(changedItemKept.items.filter(item => ['small', 'main'].includes(item.category)).length, 2);

const finish = { id: 'finish', name: '締め料理', price: 400, category: 'finish', tags: ['締め'], actual: true };
test.setState({ menu: [finish], history: [], outOfStock: { date: today, ids: [] } });
const withoutFinish = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(withoutFinish.items.some(item => item.category === 'finish'), false);
const withFinish = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 0, wantFinish: true });
assert.equal(withFinish.items.some(item => item.category === 'finish'), true);

const meatSkewer = { id: 'meat-skewer', name: '豚肉串', price: 200, category: 'skewer', tags: ['豚'], actual: true };
test.setState({ menu: [small, meatSkewer], history: [], outOfStock: { date: today, ids: [] } });
const lightOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, hunger: 'light', drink: 'none', skewerCount: 1, wantFinish: false });
assert.equal(lightOrder.items.some(item => item.id === 'meat-skewer'), true);

const hungerDishA = { id: 'hunger-a', name: '空腹度料理A', price: 300, category: 'small', tags: ['豚'], actual: true };
const hungerDishB = { id: 'hunger-b', name: '空腹度料理B', price: 300, category: 'small', tags: ['野菜'], actual: true };
const hungerDishC = { id: 'hunger-c', name: '空腹度料理C', price: 300, category: 'main', tags: ['魚介'], actual: true };
const hungerDishCount = order => order.items.filter(item => ['small', 'main'].includes(item.category)).length;
test.setState({ menu: [hungerDishA, hungerDishB, hungerDishC], history: [], outOfStock: { date: today, ids: [] } });
const intuitiveLightOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, hunger: 'light', drink: 'none', skewerCount: 0, wantFinish: false });
const intuitiveNormalOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, hunger: 'normal', drink: 'none', skewerCount: 0, wantFinish: false });
const intuitiveHeartyOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, hunger: 'hearty', drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(hungerDishCount(intuitiveLightOrder), 1);
assert.equal(hungerDishCount(intuitiveNormalOrder), 2);
assert.equal(hungerDishCount(intuitiveHeartyOrder), 3);
assert.match(intuitiveLightOrder.items.find(item => ['small', 'main'].includes(item.category)).recommendationReason, /串以外 1品/);
assert.match(intuitiveNormalOrder.items.find(item => ['small', 'main'].includes(item.category)).recommendationReason, /串以外 2品/);
assert.match(intuitiveHeartyOrder.items.find(item => ['small', 'main'].includes(item.category)).recommendationReason, /串以外 3品/);
test.setState({ menu: [hungerDishA], history: [], outOfStock: { date: today, ids: [] } });
const lightStillAllowsMeat = test.regenerateOrderKeepingManualItems(null, { ...preferences, hunger: 'light', drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(lightStillAllowsMeat.items.some(item => item.id === hungerDishA.id), true);

const pausedDrink = { ...drink, id: 'paused-drink', name: '休止中の飲み物', available: false };
const pausedSkewer = { ...meatSkewer, id: 'paused-skewer', name: '休止中の串', available: false };
test.setState({ menu: [small, pausedDrink, pausedSkewer], history: [], outOfStock: { date: today, ids: [] } });
const pausedItemsExcluded = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: pausedDrink.id, skewerCount: 1, wantFinish: false });
assert.equal(pausedItemsExcluded.items.some(item => item.available === false), false);
assert.match(pausedItemsExcluded.unavailable.join('\n'), /休止中または提供期間外/);

const futureSeasonal = test.normalizeMenuItem({ id: 'future-seasonal', name: '将来の季節料理', price: 300, category: 'small', tags: ['魚介'], actual: true, available: true, offeringType: 'seasonal', seasons: ['spring'], availableFrom: '2099-03-01', availableUntil: '2099-05-31' });
test.setState({ menu: [small, futureSeasonal], history: [], outOfStock: { date: today, ids: [] } });
const futureSeasonalExcluded = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(futureSeasonalExcluded.items.some(item => item.id === futureSeasonal.id), false);
const activeSeasonal = test.normalizeMenuItem({ id: 'active-seasonal', name: '提供中の季節料理', price: 300, category: 'small', tags: ['魚介'], actual: true, available: true, offeringType: 'seasonal', seasons: ['autumn'], availableFrom: '2020-01-01', availableUntil: '2099-12-31' });
test.setState({ menu: [activeSeasonal], history: [], outOfStock: { date: today, ids: [] } });
const activeSeasonalOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(activeSeasonalOrder.items.some(item => item.id === activeSeasonal.id), true);
assert.match(activeSeasonalOrder.items.find(item => item.id === activeSeasonal.id).recommendationReason, /季節メニュー/);

const recentDish = { id: 'recent-dish', name: '最近食べた料理', price: 300, category: 'small', tags: [], actual: true };
const freshDish = { id: 'fresh-dish', name: 'まだ食べていない料理', price: 300, category: 'small', tags: [], actual: true };
const anotherFreshDish = { id: 'another-fresh-dish', name: 'もう一つの未注文料理', price: 300, category: 'small', tags: [], actual: true };
test.setState({ menu: [recentDish, freshDish, anotherFreshDish], history: [{ date: today, items: [{ name: recentDish.name }] }], outOfStock: { date: today, ids: [] } });
const historyAwareOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, avoidRecent: false, drink: 'none', skewerCount: 0, wantFinish: false });
assert.equal(historyAwareOrder.items.some(item => item.id === 'fresh-dish'), true);
assert.equal(historyAwareOrder.items.some(item => item.id === 'recent-dish'), false);

const porkBelly = { id: 'pork-belly', name: '豚バラ串', price: 200, category: 'skewer', tags: ['豚'], actual: true };
const chickenSkewer = { id: 'chicken-skewer', name: '鶏もも串', price: 200, category: 'skewer', tags: ['鶏'], actual: true };
test.setState({
  menu: [porkBelly, chickenSkewer],
  history: [
    { date: today, items: [{ name: chickenSkewer.name }] },
    { date: today, items: [{ name: porkBelly.name }] }
  ],
  outOfStock: { date: today, ids: [] }
});
const noConsecutivePork = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 1, wantFinish: false });
assert.equal(noConsecutivePork.items.some(item => item.id === 'pork-belly'), false);
assert.equal(noConsecutivePork.items.some(item => item.id === 'chicken-skewer'), true);

test.setState({ menu: [porkBelly], history: [{ date: today, items: [{ name: porkBelly.name }] }], outOfStock: { date: today, ids: [] } });
const onlyAvailableRepeat = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: 'none', skewerCount: 1, wantFinish: false });
assert.equal(onlyAvailableRepeat.items.some(item => item.id === 'pork-belly'), true);

const largeBeer = { id: 'large-beer', name: '大瓶ビール', price: 726, category: 'drink', tags: ['飲み物'], actual: true };
const expensiveSmall = { id: 'expensive-small', name: '高額な一品', price: 1540, category: 'small', tags: ['牛'], actual: true };
const fiveSkewers = Array.from({ length: 5 }, (_, index) => ({ id: `skewer-${index}`, name: `串${index + 1}`, price: 198, category: 'skewer', tags: ['豚'], actual: true }));
test.setState({ menu: [largeBeer, expensiveSmall, ...fiveSkewers], history: [], outOfStock: { date: today, ids: [] } });
const softBudgetOrder = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: largeBeer.id, skewerCount: 5, wantFinish: false });
assert.equal(softBudgetOrder.items.filter(item => item.category === 'skewer').length, 5);
assert.equal(softBudgetOrder.items.some(item => item.id === expensiveSmall.id), true);
assert.equal(softBudgetOrder.total > softBudgetOrder.budget, true);
assert.equal(softBudgetOrder.unavailable.some(message => message.startsWith('目安予算 ')), true);
assert.match(softBudgetOrder.items.find(item => item.id === expensiveSmall.id).recommendationReason, /高額品/);

const normalizedPending = test.normalizePendingOrder({
  date: '2026-08-20',
  savedAt: '2026-08-20T10:00:00.000Z',
  order: {
    items: [{ ...manuallyAdded, recommendationReason: 'メニューから手動で追加' }],
    total: 1,
    budget: 9999,
    unavailable: ['確認メッセージ'],
    preferences: { ...preferences, budget: 9999, avoidRecent: false },
    excludedIds: ['sold-out']
  }
});
assert.equal(normalizedPending.date, '2026-08-20');
assert.equal(normalizedPending.order.total, manuallyAdded.price);
assert.equal(normalizedPending.order.budget, 3000);
assert.equal(normalizedPending.order.preferences.avoidRecent, true);
assert.equal(normalizedPending.order.items[0].manuallyAdded, true);
assert.equal(normalizedPending.order.items[0].recommendationReason, 'メニューから手動で追加');
assert.equal(test.normalizePendingOrder({ order: { items: [] } }), null);

const normalizedChangedPending = test.normalizePendingOrder({
  date: '2026-08-20',
  order: {
    items: [manuallyChangedOrder.items[1]],
    preferences: { ...preferences, drink: 'none', skewerCount: 0 },
    unavailable: [],
    excludedIds: []
  }
});
assert.equal(normalizedChangedPending.order.items[0].manuallyChanged, true);
assert.equal(normalizedChangedPending.order.items[0].changedFrom.name, small.name);
assert.equal(normalizedChangedPending.order.items[0].changeReason, '今回は気分ではない');

test.setState({
  stores: [{ id: 'hidaka-001', name: 'やきとり日高', area: '', memo: '' }],
  activeStoreId: 'hidaka-001',
  menu: [drink, small, manuallyAdded, fee],
  history: []
});
const structuredHistory = test.createHistoryRecord({
  storeId: 'hidaka-001',
  items: [drink, manuallyChangedOrder.items[1], manuallyAdded, fee],
  total: drink.price + manualReplacement.price + manuallyAdded.price + fee.price,
  preferences: {
    budget: 3000,
    hunger: 'light',
    skewerCount: 5,
    drink: drink.id,
    moods: ['魚介', '野菜'],
    mustShishito: true,
    wantFinish: false,
    avoidRecent: true
  }
}, '2026-08-20', '2026-08-20T10:00:00.000Z');
assert.match(structuredHistory.id, /^history-/);
assert.match(structuredHistory.visitId, /^visit-/);
assert.equal(structuredHistory.visitedAt, '2026-08-20T10:00:00.000Z');
assert.equal(structuredHistory.visitTimeKnown, true);
assert.equal(structuredHistory.items[0].menuId, drink.id);
assert.equal(structuredHistory.items[0].orderIndex, 1);
assert.equal(structuredHistory.items[0].quantity, 1);
assert.equal(structuredHistory.items[0].unitPrice, drink.price);
assert.equal(structuredHistory.items[0].source, 'recommended');
assert.equal(structuredHistory.items[1].source, 'changed');
assert.equal(structuredHistory.items[1].aiSuggestion.name, small.name);
assert.equal(structuredHistory.items[1].changeReason, '今回は気分ではない');
assert.equal(structuredHistory.items[2].source, 'manual');
assert.equal(structuredHistory.items[3].source, 'fixed');
assert.equal(structuredHistory.total, drink.price + manualReplacement.price + manuallyAdded.price + fee.price);
assert.equal(structuredHistory.context.budget, 3000);
assert.equal(structuredHistory.context.hunger, 'light');
assert.equal(structuredHistory.context.skewerCount, 5);
assert.deepEqual(Array.from(structuredHistory.context.moods), ['魚介', '野菜']);
assert.equal(structuredHistory.context.startingDrinkId, drink.id);
assert.equal(structuredHistory.context.startingDrinkName, drink.name);
assert.equal(structuredHistory.context.mustShishito, true);
assert.equal(structuredHistory.context.wantFinish, false);
assert.equal(structuredHistory.context.avoidRecent, true);
assert.equal(structuredHistory.context.shochuKeepUsed, true);
assert.equal(structuredHistory.context.visitStage, '');
assert.equal(structuredHistory.context.plansSecondVenue, null);
assert.equal(structuredHistory.context.seafoodRequested, null);
assert.equal(structuredHistory.context.meatRequested, null);
assert.equal(structuredHistory.context.seasonalRequested, null);
assert.equal(structuredHistory.context.stayDurationMinutes, null);
assert.equal(structuredHistory.context.otherWishes, '');

const migratedLegacyHistory = test.normalizeHistoryItem({
  id: 'legacy-history',
  店舗ID: 'hidaka-001',
  日付: '2026-08-19',
  注文: `${small.name}|未登録料理`
}, [small]);
assert.equal(migratedLegacyHistory.visitId, 'visit-legacy-history');
assert.equal(migratedLegacyHistory.visitTimeKnown, false);
assert.equal(migratedLegacyHistory.items[0].menuId, small.id);
assert.equal(migratedLegacyHistory.items[0].source, 'legacy');
assert.equal(migratedLegacyHistory.items[1].menuId, '');
assert.equal(migratedLegacyHistory.items[1].quantity, 1);
assert.equal(migratedLegacyHistory.total, null);
assert.equal(migratedLegacyHistory.context.budget, null);
assert.equal(migratedLegacyHistory.context.hunger, '');
assert.equal(migratedLegacyHistory.context.skewerCount, null);
assert.deepEqual(Array.from(migratedLegacyHistory.context.moods), []);
assert.equal(migratedLegacyHistory.context.startingDrinkId, '');
assert.equal(migratedLegacyHistory.context.startingDrinkName, '');
assert.equal(migratedLegacyHistory.context.mustShishito, null);
assert.equal(migratedLegacyHistory.context.shochuKeepUsed, null);
const localizedContext = test.normalizeVisitContext({
  予算: 3000,
  空腹度: '普通',
  串本数: 3,
  今日の気分: '魚介|野菜',
  開始飲み物ID: drink.id,
  ししとう必須: 'はい',
  締め希望: 'いいえ',
  焼酎キープ利用: '利用'
}, [drink]);
assert.equal(localizedContext.hunger, 'normal');
assert.deepEqual(Array.from(localizedContext.moods), ['魚介', '野菜']);
assert.equal(localizedContext.startingDrinkName, drink.name);
assert.equal(localizedContext.mustShishito, true);
assert.equal(localizedContext.wantFinish, false);
assert.equal(localizedContext.shochuKeepUsed, true);
const pricedLegacyHistory = test.normalizeHistoryItem({
  id: 'priced-legacy-history',
  date: '2026-08-18',
  items: [{ name: small.name, price: 250, quantity: 2 }]
}, [{ ...small, price: 999 }]);
assert.equal(pricedLegacyHistory.items[0].menuId, small.id);
assert.equal(pricedLegacyHistory.items[0].unitPrice, 250);
assert.equal(pricedLegacyHistory.items[0].quantity, 2);
assert.equal(pricedLegacyHistory.items[0].subtotal, 500);
assert.equal(pricedLegacyHistory.total, 500);

test.setState({
  dataSchemaVersion: 5,
  defaultMenuVersion: 'test-version',
  stores: [{ id: 'hidaka-001', name: 'やきとり日高', area: '', memo: '' }],
  activeStoreId: 'hidaka-001',
  menu: [drink, small, manuallyAdded],
  initialMenu: [drink, small],
  history: [{ id: 'history-1', date: '2026-08-20', items: [{ name: small.name, price: small.price }] }],
  preferences,
  menuSortMode: 'category',
  outOfStock: { date: '2026-08-20', ids: ['sold-out'] },
  pendingOrder: normalizedPending
});
const fullBackup = test.createFullBackupPayload();
assert.equal(fullBackup.format, 'hidaka-order-full-backup');
assert.equal(fullBackup.schemaVersion, 5);
assert.equal(fullBackup.source.storeId, 'hidaka-001');
assert.equal(fullBackup.data.stores[0].name, 'やきとり日高');
assert.equal(fullBackup.data.menu.length, 3);
assert.equal(fullBackup.data.menuSortMode, 'category');
const restoredBackup = test.normalizeFullBackup(fullBackup);
assert.equal(restoredBackup.state.activeStoreId, 'hidaka-001');
assert.equal(restoredBackup.state.dataSchemaVersion, 5);
assert.equal(restoredBackup.state.stores[0].id, 'hidaka-001');
assert.equal(restoredBackup.state.menu.length, 3);
assert.equal(restoredBackup.state.menuSortMode, 'category');
assert.equal(restoredBackup.state.initialMenu.length, 2);
assert.equal(restoredBackup.state.history[0].items[0].price, small.price);
assert.equal(restoredBackup.state.history[0].items[0].menuId, small.id);
assert.equal(restoredBackup.state.history[0].items[0].orderIndex, 1);
assert.equal(restoredBackup.state.history[0].items[0].quantity, 1);
assert.equal(restoredBackup.state.history[0].context.budget, null);
assert.equal(restoredBackup.state.pendingOrder.order.items[0].manuallyAdded, true);
const versionFourBackup = JSON.parse(JSON.stringify(fullBackup));
versionFourBackup.schemaVersion = 4;
const restoredVersionFourBackup = test.normalizeFullBackup(versionFourBackup);
assert.equal(restoredVersionFourBackup.state.dataSchemaVersion, 5);
const versionThreeBackup = JSON.parse(JSON.stringify(fullBackup));
versionThreeBackup.schemaVersion = 3;
const restoredVersionThreeBackup = test.normalizeFullBackup(versionThreeBackup);
assert.equal(restoredVersionThreeBackup.state.dataSchemaVersion, 5);
const versionTwoBackup = JSON.parse(JSON.stringify(fullBackup));
versionTwoBackup.schemaVersion = 2;
const restoredVersionTwoBackup = test.normalizeFullBackup(versionTwoBackup);
assert.equal(restoredVersionTwoBackup.state.dataSchemaVersion, 5);
assert.equal(restoredVersionTwoBackup.state.history[0].context.budget, null);
const legacyBackup = JSON.parse(JSON.stringify(fullBackup));
legacyBackup.schemaVersion = 1;
delete legacyBackup.data.stores;
delete legacyBackup.data.activeStoreId;
delete legacyBackup.data.dataSchemaVersion;
delete legacyBackup.data.menuSortMode;
delete legacyBackup.source.storeId;
const restoredLegacyBackup = test.normalizeFullBackup(legacyBackup);
assert.equal(restoredLegacyBackup.state.activeStoreId, 'hidaka-001');
assert.equal(restoredLegacyBackup.state.dataSchemaVersion, 5);
assert.equal(restoredLegacyBackup.state.stores[0].name, 'やきとり日高');
assert.equal(restoredLegacyBackup.state.menuSortMode, 'tag');
assert.throws(() => test.normalizeFullBackup({ format: 'unknown', schemaVersion: 1, data: {} }), /完全バックアップではありません/);
assert.throws(() => test.normalizeFullBackup({ ...fullBackup, schemaVersion: 6 }), /未対応/);

console.log('履歴構造、注文時状況、季節・期間限定、旧履歴移行、店舗ID、提供休止、品切れ置換、手動変更、注文条件、未記録注文、完全バックアップを確認しました。');
