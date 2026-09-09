import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appPath = new URL('../app.js', import.meta.url);
const source = readFileSync(appPath, 'utf8');
const instrumented = source.replace(
  /\n\s*boot\(\);\s*\n\}\)\(\);\s*$/,
  '\n  globalThis.__hidakaTest = { createOrder, recentOrderStats, skewerBalancePenalty, rankOrderCandidates, setState: value => { state = value; } };\n})();\n'
);
assert.notEqual(instrumented, source, 'app.js のテスト準備に失敗しました。');

let randomCalls = 0;
const testMath = Object.create(Math);
testMath.random = () => { randomCalls += 1; return 0; };
const context = vm.createContext({ console, Math: testMath });
vm.runInContext(instrumented, context, { filename: 'app.js' });
const test = context.__hidakaTest;

const skewer = (id, tags, price = 198) => ({ id, name: id, price, category: 'skewer', tags, actual: true, available: true });
const chicken = index => skewer(`鶏${index}`, ['鶏']);
const vegetable = index => skewer(`野菜${index}`, ['野菜']);
const offal = (id, mainTag) => skewer(id, [mainTag, '内臓']);
const shishito = { ...vegetable('ししとう'), tags: ['野菜', 'ししとう'] };

const candidateChicken = chicken('候補');
assert.equal(test.skewerBalancePenalty(candidateChicken, []), 0);
assert.equal(test.skewerBalancePenalty(candidateChicken, [chicken(1)]), 0);
assert.equal(test.skewerBalancePenalty(candidateChicken, [chicken(1), chicken(2)]), 2);
assert.equal(test.skewerBalancePenalty(candidateChicken, [chicken(1), chicken(2), chicken(3)]), 4);

const porkVegetable = skewer('豚野菜', ['豚', '野菜']);
const twoPorkAndTwoVegetables = [skewer('豚1', ['豚']), skewer('豚2', ['豚']), vegetable(1), vegetable(2)];
assert.equal(test.skewerBalancePenalty(porkVegetable, twoPorkAndTwoVegetables), 2, '複数主タグを合算しない');
assert.equal(test.skewerBalancePenalty(vegetable('追加野菜'), [shishito]), 0, 'ししとう込みの野菜2本目は減点しない');
assert.equal(test.skewerBalancePenalty(vegetable('追加野菜'), [shishito, vegetable(1)]), 2, 'ししとうを野菜1本として数える');

const candidateOffal = offal('内臓候補', '鶏');
assert.equal(test.skewerBalancePenalty(candidateOffal, [offal('内臓1', '豚')]), 0);
assert.equal(test.skewerBalancePenalty(candidateOffal, [offal('内臓1', '豚'), offal('内臓2', '牛')]), 2);
assert.equal(test.skewerBalancePenalty(candidateOffal, [offal('内臓1', '鶏'), offal('内臓2', '鶏')]), 4, '主系統2点と内臓2点を別枠で加える');
assert.equal(test.skewerBalancePenalty(skewer('うずら', ['卵']), [skewer('卵1', ['卵']), skewer('卵2', ['卵'])]), 0);

randomCalls = 0;
const ranked = test.rankOrderCandidates([chicken(1), chicken(2), chicken(3)], () => 0);
assert.equal(randomCalls, 3, '候補ごとに乱数は1回だけ生成する');
assert.deepEqual(Array.from(ranked, item => item.id), ['鶏1', '鶏2', '鶏3']);

const preferences = {
  budget: 3000, hunger: 'light', selectedDishId: '', featuredDishId: '', featuredDishDate: '2026-09-05',
  includeFeaturedDish: false, skewerCount: 5, drink: 'none', moods: [], mustShishito: true, wantFinish: false, avoidRecent: true
};
const small = { id: '小皿', name: '小皿', price: 300, category: 'small', tags: [], actual: true, available: true };

test.setState({
  menu: [], activeStoreId: 'hidaka-001',
  history: [
    { date: '2026-09-03', items: [{ name: '3回前' }] },
    { date: '2026-09-04', items: [{ name: '前々回' }] },
    { date: '2026-09-05', items: [{ name: '前回' }] }
  ]
});
const historyWeights = test.recentOrderStats();
assert.equal(historyWeights.penalty({ name: '前回' }), 9);
assert.equal(historyWeights.penalty({ name: '前々回' }), 5);
assert.equal(historyWeights.penalty({ name: '3回前' }), 2);

const beef = skewer('牛1', ['牛']);
const fourChicken = [chicken(1), chicken(2), chicken(3), chicken(4)];
test.setState({ menu: [small, shishito, ...fourChicken, beef], history: [], outOfStock: { date: '2026-09-05', ids: [] }, activeStoreId: 'hidaka-001' });
const balanced = test.createOrder(preferences, []);
assert.equal(balanced.items.filter(item => item.category === 'skewer').length, 5);
assert.equal(balanced.items.some(item => item.id === shishito.id), true);
assert.equal(balanced.items.some(item => item.id === beef.id), true, '3本目の同系統より別系統を軽く優先する');
assert.equal(balanced.items.filter(item => item.tags.includes('鶏')).length, 3);

test.setState({ menu: [small, shishito, ...fourChicken], history: [], outOfStock: { date: '2026-09-05', ids: [] }, activeStoreId: 'hidaka-001' });
const shortageFallback = test.createOrder(preferences, []);
assert.equal(shortageFallback.items.filter(item => item.category === 'skewer').length, 5, '偏った候補しかなくても完全除外しない');

const wantedPork = skewer('食べたい豚', ['豚']);
test.setState({ menu: [small, shishito, wantedPork, chicken(1), chicken(2), beef, vegetable(1)], history: [], outOfStock: { date: '2026-09-05', ids: [] }, activeStoreId: 'hidaka-001' });
const moodOrder = test.createOrder({ ...preferences, moods: ['pork'] }, []);
assert.equal(moodOrder.items.some(item => item.id === wantedPork.id), true, '食べたいもの+5点を維持する');

test.setState({
  menu: [small, shishito, wantedPork, chicken(1), chicken(2), beef, vegetable(1)],
  history: [{ date: '2026-09-05', items: [{ name: wantedPork.name }] }],
  outOfStock: { date: '2026-09-05', ids: [] }, activeStoreId: 'hidaka-001'
});
const latestAvoided = test.createOrder({ ...preferences, moods: ['pork'] }, []);
assert.equal(latestAvoided.items.some(item => item.id === wantedPork.id), false, '前回注文の回避を維持する');

console.log('串の主系統・内臓減点、複数タグ、ししとう、候補不足、固定乱数、履歴・気分の優先を確認しました。');
