import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appPath = new URL('../app.js', import.meta.url);
const source = readFileSync(appPath, 'utf8');
const instrumented = source.replace(
  /\n\s*boot\(\);\s*\n\}\)\(\);\s*$/,
  '\n  globalThis.__hidakaTest = { replaceOutOfStockItems, regenerateOrderKeepingManualItems, normalizePendingOrder, normalizeStore, normalizeStores, normalizeMenuItem, normalizeDefaultMenuRows, buildMenuCsv, createFullBackupPayload, normalizeFullBackup, setState: value => { state = value; } };\n})();\n'
);
assert.notEqual(instrumented, source, 'app.js のテスト準備に失敗しました。');

const context = vm.createContext({ console });
vm.runInContext(instrumented, context, { filename: 'app.js' });
const test = context.__hidakaTest;

const stableIdItem = test.normalizeMenuItem({ メニューID: 'base-001', 料理名: '固定ID確認', 価格: 100, 分類: '小皿', タグ: '軽め', 実額: true });
assert.equal(stableIdItem.id, 'base-001');
assert.equal(stableIdItem.storeId, 'hidaka-001');
assert.equal(stableIdItem.available, true);
const pausedCsvItem = test.normalizeMenuItem({ メニューID: 'base-002', 店舗ID: 'hidaka-001', 料理名: '休止確認', 価格: 200, 分類: '小皿', タグ: '', 実額: true, 提供状態: '休止中' });
assert.equal(pausedCsvItem.available, false);
assert.match(test.buildMenuCsv([stableIdItem, pausedCsvItem]), /^メニューID,店舗ID,料理名,価格,分類,タグ,実額,提供状態\nbase-001,hidaka-001,[^\n]+,提供中\nbase-002,hidaka-001,[^\n]+,休止中\n$/);
const normalizedStore = test.normalizeStore({ 店舗ID: 'hidaka-001', 店名: 'やきとり日高', エリア: '', メモ: '' });
assert.equal(normalizedStore.id, 'hidaka-001');
assert.equal(normalizedStore.name, 'やきとり日高');
assert.equal(normalizedStore.area, '');
assert.equal(normalizedStore.memo, '');
assert.equal(test.normalizeStores([{ id: 'duplicate', name: '店舗1' }, { id: 'duplicate', name: '店舗2' }]).length, 0);
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
test.setState({ menu: [small, replacement], history: [], outOfStock: { date: today, ids: [] } });
const regenerated = test.regenerateOrderKeepingManualItems({ ...originalOrder, items: [small, manuallyAdded], total: 800 }, { ...preferences, drink: 'none', skewerCount: 0 });
assert.equal(regenerated.items.filter(item => item.manuallyAdded).map(item => item.id).join(','), 'manual');
assert.equal(regenerated.total, regenerated.items.reduce((sum, item) => sum + item.price, 0));

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

const pausedDrink = { ...drink, id: 'paused-drink', name: '休止中の飲み物', available: false };
const pausedSkewer = { ...meatSkewer, id: 'paused-skewer', name: '休止中の串', available: false };
test.setState({ menu: [small, pausedDrink, pausedSkewer], history: [], outOfStock: { date: today, ids: [] } });
const pausedItemsExcluded = test.regenerateOrderKeepingManualItems(null, { ...preferences, drink: pausedDrink.id, skewerCount: 1, wantFinish: false });
assert.equal(pausedItemsExcluded.items.some(item => item.available === false), false);
assert.match(pausedItemsExcluded.unavailable.join('\n'), /提供休止中/);

const recentDish = { id: 'recent-dish', name: '最近食べた料理', price: 300, category: 'small', tags: [], actual: true };
const freshDish = { id: 'fresh-dish', name: 'まだ食べていない料理', price: 300, category: 'small', tags: [], actual: true };
test.setState({ menu: [recentDish, freshDish], history: [{ date: today, items: [{ name: recentDish.name }] }], outOfStock: { date: today, ids: [] } });
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

test.setState({
  defaultMenuVersion: 'test-version',
  stores: [{ id: 'hidaka-001', name: 'やきとり日高', area: '', memo: '' }],
  activeStoreId: 'hidaka-001',
  menu: [drink, small, manuallyAdded],
  initialMenu: [drink, small],
  history: [{ id: 'history-1', date: '2026-08-20', items: [{ name: small.name, price: small.price }] }],
  preferences,
  outOfStock: { date: '2026-08-20', ids: ['sold-out'] },
  pendingOrder: normalizedPending
});
const fullBackup = test.createFullBackupPayload();
assert.equal(fullBackup.format, 'hidaka-order-full-backup');
assert.equal(fullBackup.schemaVersion, 1);
assert.equal(fullBackup.source.storeId, 'hidaka-001');
assert.equal(fullBackup.data.stores[0].name, 'やきとり日高');
assert.equal(fullBackup.data.menu.length, 3);
const restoredBackup = test.normalizeFullBackup(fullBackup);
assert.equal(restoredBackup.state.activeStoreId, 'hidaka-001');
assert.equal(restoredBackup.state.stores[0].id, 'hidaka-001');
assert.equal(restoredBackup.state.menu.length, 3);
assert.equal(restoredBackup.state.initialMenu.length, 2);
assert.equal(restoredBackup.state.history[0].items[0].price, small.price);
assert.equal(restoredBackup.state.pendingOrder.order.items[0].manuallyAdded, true);
const legacyBackup = JSON.parse(JSON.stringify(fullBackup));
delete legacyBackup.data.stores;
delete legacyBackup.data.activeStoreId;
delete legacyBackup.source.storeId;
const restoredLegacyBackup = test.normalizeFullBackup(legacyBackup);
assert.equal(restoredLegacyBackup.state.activeStoreId, 'hidaka-001');
assert.equal(restoredLegacyBackup.state.stores[0].name, 'やきとり日高');
assert.throws(() => test.normalizeFullBackup({ format: 'unknown', schemaVersion: 1, data: {} }), /完全バックアップではありません/);

console.log('店舗ID、固定メニューID、提供休止、品切れ置換、注文条件、未記録注文、完全バックアップの復元データを確認しました。');
