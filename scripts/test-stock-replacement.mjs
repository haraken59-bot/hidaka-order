import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appPath = new URL('../app.js', import.meta.url);
const source = readFileSync(appPath, 'utf8');
const instrumented = source.replace(
  /\n\s*boot\(\);\s*\n\}\)\(\);\s*$/,
  '\n  globalThis.__hidakaTest = { replaceOutOfStockItems, regenerateOrderKeepingManualItems, normalizePendingOrder, setState: value => { state = value; } };\n})();\n'
);
assert.notEqual(instrumented, source, 'app.js のテスト準備に失敗しました。');

const context = vm.createContext({ console });
vm.runInContext(instrumented, context, { filename: 'app.js' });
const test = context.__hidakaTest;

const drink = { id: 'drink', name: '飲み物', price: 400, category: 'drink', tags: [], actual: true };
const small = { id: 'small', name: '小皿', price: 300, category: 'small', tags: [], actual: true };
const soldOut = { id: 'sold-out', name: '品切れ串', price: 200, category: 'skewer', tags: ['鶏'], actual: true };
const replacement = { id: 'replacement', name: '代わりの串', price: 180, category: 'skewer', tags: ['鶏'], actual: true };
const fee = { id: 'fee', name: '割代', price: 220, category: 'fee', tags: [], actual: true };
const preferences = { budget: 3000, hunger: 'normal', skewerCount: 1, drink: 'drink', moods: [], mustShishito: false, wantFinish: false, avoidRecent: false };
const originalOrder = { items: [drink, small, soldOut, fee], total: 1120, budget: 3000, unavailable: [], preferences, excludedIds: [] };

test.setState({ menu: [drink, small, soldOut, replacement], history: [] });
const replaced = test.replaceOutOfStockItems(originalOrder, ['sold-out'], ['sold-out']);
assert.equal(replaced.items.map(item => item.id).join(','), 'drink,small,replacement,fee');
assert.equal(replaced.total, 1100);
assert.match(replaced.unavailable.join('\n'), /「品切れ串」を「代わりの串」に変更しました/);

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

console.log('品切れ置換、注文条件、未記録注文の復元データを確認しました。');
