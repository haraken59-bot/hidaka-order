import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const instrumented = source.replace(/\n\s*boot\(\);\s*\n\}\)\(\);\s*$/, `
  globalThis.__menuTest = {
    parseCsv, normalizeDefaultMenuRows, normalizeMenuItem, applyConfirmedMenuCorrections,
    loadState, saveState, defaultState, normalizeFullBackup, createFullBackupPayload,
    normalizeHistoryItem, historyNameKey, recentOrderStats, renderMenuTagChoices,
    canonicalTag, localizeTag, MENU_TAG_GROUPS, FOOD_MOOD_TAGS, MENU_CORRECTION_ID,
    setState: value => { state = value; },
    setDefaults: (menu, version = DEFAULT_MENU_VERSION) => { defaultMenu = menu; activeDefaultMenuVersion = version; }
  };
})();`);
assert.notEqual(instrumented, source);
const storage = new Map();
function element() {
  return { children: [], append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; } };
}
const tagContainer = element();
const context = vm.createContext({
  console,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  document: { createElement: element, querySelector: selector => { assert.equal(selector, '#itemTagChoices'); return tagContainer; } }
});
vm.runInContext(instrumented, context, { filename: 'app.js' });
const api = context.__menuTest;
const clone = value => JSON.parse(JSON.stringify(value));
const currentMenu = api.normalizeDefaultMenuRows(api.parseCsv(readFileSync(new URL('../data/hidaka-menu.csv', import.meta.url), 'utf8')));
api.setDefaults(currentMenu);
assert.equal(currentMenu.length, 101);

// 独立した期待値。移行定義そのものを期待値に流用しない。
const expected = new Map([
  ['base-043', ['豚', '野菜']], ['base-018', ['牛', '豚', '野菜']],
  ['base-044', ['豚', '野菜']], ['base-045', ['豚', '野菜']],
  ['base-022', ['牛', '野菜']], ['base-030', ['卵']],
  ['base-015', ['牛', '内臓']], ['base-027', ['鶏', '内臓']],
  ['base-031', ['鶏', '内臓']], ['base-032', ['鶏', '内臓']],
  ['base-039', ['豚', '内臓']], ['base-035', ['牛']]
]);
const oldTags = new Map([
  ['base-043', []], ['base-018', ['野菜']], ['base-044', ['野菜']], ['base-045', ['野菜']],
  ['base-022', ['豚', '牛']], ['base-030', ['鶏']], ['base-015', ['牛']],
  ['base-027', ['鶏']], ['base-031', ['鶏']], ['base-032', ['鶏']],
  ['base-039', ['豚']], ['base-035', ['牛']]
]);
for (const [id, tags] of expected) assert.deepEqual(clone(currentMenu.find(item => item.id === id).tags), tags, id);
assert.equal(currentMenu.find(item => item.id === 'base-022').name, '春菊の牛バラ巻');
const oldMenu = clone(currentMenu).map(item => ({ ...item,
  name: item.id === 'base-022' ? '春蘭の牛バラ巻' : item.name,
  tags: oldTags.has(item.id) ? oldTags.get(item.id) : item.tags
}));
const history = api.normalizeHistoryItem({
  id: 'visit-before', storeId: 'hidaka-001', date: '2026-09-03',
  items: [{ name: '春蘭の牛バラ巻', price: 330, quantity: 2 }]
}, oldMenu);
const original = { ...clone(api.defaultState()), defaultMenuVersion: 'hidaka-menu-2026-08-31-v1',
  appliedMenuCorrections: ['an-earlier-correction'], menu: clone(oldMenu), initialMenu: clone(oldMenu),
  history: [history], outOfStock: { date: '2026-09-04', ids: ['base-044'] },
  pendingOrder: { date: '2026-09-03', order: { items: [clone(oldMenu.find(item => item.id === 'base-022'))], total: 330 } }
};
const untouched = clone(original);
const migrated = api.applyConfirmedMenuCorrections(original);
assert.deepEqual(clone(original), untouched, 'pure migration must not mutate its input');
for (const field of ['menu', 'initialMenu']) {
  assert.equal(migrated[field].length, original[field].length);
  for (let index = 0; index < original[field].length; index++) {
    const before = original[field][index];
    const after = migrated[field][index];
    if (!expected.has(before.id)) { assert.deepEqual(clone(after), clone(before)); continue; }
    assert.deepEqual(clone(after.tags), expected.get(before.id), before.id);
    assert.equal(after.name, before.id === 'base-022' ? '春菊の牛バラ巻' : before.name);
    const omitCorrectionFields = ({ name, tags, ...rest }) => rest;
    assert.deepEqual(clone(omitCorrectionFields(after)), clone(omitCorrectionFields(before)), 'only name/tags may change');
  }
}
assert.equal(migrated.history, original.history);
assert.equal(migrated.pendingOrder, original.pendingOrder);
assert.equal(migrated.outOfStock, original.outOfStock);
assert.equal(migrated.preferences, original.preferences);
assert.deepEqual(clone(migrated.appliedMenuCorrections), ['an-earlier-correction', api.MENU_CORRECTION_ID]);
assert.equal(api.applyConfirmedMenuCorrections(migrated), migrated, 'apply exactly once');

// 削除、価格編集、区分編集、季節、休止、独自タグ、追加商品を維持する。
const customized = clone(original);
customized.menu = customized.menu.filter(item => item.id !== 'base-044');
customized.initialMenu = customized.initialMenu.filter(item => item.id !== 'base-045');
const edited = customized.menu.find(item => item.id === 'base-043');
Object.assign(edited, { price: 999, actual: false, category: 'main', available: false,
  offeringType: 'seasonal', seasons: ['autumn'], availableFrom: '2026-09-01', availableUntil: '2026-11-30',
  memo: '個人メモを保持', updatedAt: '2026-09-02T12:00:00.000Z', tags: ['light', 'spicy', '自分用'] });
customized.menu.find(item => item.id === 'base-035').tags = ['beef', 'offal', '軽め'];
customized.menu.push(api.normalizeMenuItem({ id: 'personal-item', name: '追加した串', price: 444, category: 'skewer', tags: ['野菜'], available: false }));
const otherStore = { ...clone(edited), storeId: 'another-store' };
customized.menu.push(otherStore);
const renamed = customized.menu.find(item => item.id === 'base-027');
renamed.name = '自分で別の商品に変更';
const customId = { ...clone(edited), id: 'custom-shiso', category: 'skewer' };
customized.menu.push(customId);
const customAfter = api.applyConfirmedMenuCorrections(customized);
const normalizedCustomAfter = api.applyConfirmedMenuCorrections({ ...customized,
  menu: customized.menu.map(api.normalizeMenuItem), initialMenu: customized.initialMenu.map(api.normalizeMenuItem)
});
assert.equal(customAfter.menu.length, customized.menu.length);
assert.equal(customAfter.menu.some(item => item.id === 'base-044'), false);
assert.equal(customAfter.initialMenu.some(item => item.id === 'base-045'), false);
assert.deepEqual(clone(customAfter.menu.find(item => item.id === 'base-043' && item.storeId === 'hidaka-001')), { ...edited, tags: ['豚', '野菜', 'light', 'spicy', '自分用'] });
assert.deepEqual(clone(customAfter.menu.find(item => item.id === 'base-035').tags), ['牛', '軽め']);
for (const preserved of [otherStore, renamed, customId, customized.menu.find(item => item.id === 'personal-item')]) {
  assert.deepEqual(clone(customAfter.menu.find(item => item.id === preserved.id && item.storeId === preserved.storeId)), clone(preserved));
}

// 実際の起動経路。CSV版の相違・一時フォールバックでも全件置換しない。
storage.set('hidaka-order-v1', JSON.stringify(customized));
const loaded = api.loadState();
assert.deepEqual(clone(loaded.menu), clone(normalizedCustomAfter.menu));
assert.deepEqual(clone(loaded.initialMenu), clone(normalizedCustomAfter.initialMenu));
assert.equal(loaded.history[0].items[0].name, '春蘭の牛バラ巻');
assert.equal(loaded.history[0].items[0].menuId, 'base-022');
assert.equal(loaded.history[0].items[0].unitPrice, 330);
assert.equal(loaded.history[0].items[0].quantity, 2);
assert.equal(loaded.history[0].total, 660);
assert.equal(loaded.pendingOrder.order.items[0].name, '春蘭の牛バラ巻');
assert.equal(loaded.pendingOrder.order.items[0].price, 330);
assert.deepEqual(clone(loaded.outOfStock), customized.outOfStock);
loaded.menu.find(item => item.id === 'base-030').tags = ['後から手動編集'];
api.setState(loaded);
api.saveState();
assert.deepEqual(clone(api.loadState().menu), clone(loaded.menu), 'subsequent manual edits survive restart');
api.setDefaults([], 'fallback-menu-v1');
assert.deepEqual(clone(api.loadState().menu), clone(loaded.menu), 'temporary CSV failure must not replace saved data');
api.setDefaults(currentMenu);

// 空メニューも「全削除」という利用者の状態として尊重。
storage.set('hidaka-order-v1', JSON.stringify({ ...customized, menu: [], initialMenu: [] }));
assert.equal(api.loadState().menu.length, 0);
assert.equal(api.loadState().initialMenu.length, 0);
const legacy = { ...customized };
delete legacy.initialMenu;
delete legacy.appliedMenuCorrections;
storage.set('hidaka-order-v1', JSON.stringify(legacy));
assert.deepEqual(clone(api.loadState().initialMenu), clone(api.loadState().menu));

// 完全バックアップに更新済み印を残す。旧バックアップも部分更新。
api.setState(loaded);
const backup = api.createFullBackupPayload();
const restored = api.normalizeFullBackup(backup).state;
assert.deepEqual(clone(restored.menu), clone(loaded.menu));
assert.deepEqual(clone(restored.appliedMenuCorrections), clone(loaded.appliedMenuCorrections));
const oldBackup = { ...clone(backup), data: clone(customized) };
const oldRestored = api.normalizeFullBackup(oldBackup).state;
assert.deepEqual(clone(oldRestored.menu), clone(normalizedCustomAfter.menu));
assert.equal(oldRestored.history[0].items[0].name, '春蘭の牛バラ巻');
assert.equal(oldRestored.history[0].total, 660);

// 表示上の履歴を改名せず、重複回避だけは旧名と新名を同一と認識。
api.setState(loaded);
assert.equal(api.historyNameKey('春蘭の牛バラ巻'), api.historyNameKey('春菊の牛バラ巻'));
assert.equal(api.recentOrderStats().penalty({ name: '春菊の牛バラ巻' }), 9);

// 補助タグは常設スイッチ。食べたいものの主系統には混ぜない。
assert.equal(api.canonicalTag('内臓'), 'offal');
assert.equal(api.canonicalTag('卵'), 'egg');
assert.equal(api.FOOD_MOOD_TAGS.has('offal'), false);
assert.equal(api.FOOD_MOOD_TAGS.has('egg'), false);
api.renderMenuTagChoices(['鶏', '内臓', '卵']);
const auxiliaryGroup = tagContainer.children.find(section => section.children[0].textContent === '食材の補助タグ');
assert.ok(auxiliaryGroup);
const inputs = auxiliaryGroup.children[1].children.map(label => label.children[0]);
assert.deepEqual(inputs.map(input => input.value), ['offal', 'egg']);
assert.ok(inputs.every(input => input.type === 'checkbox' && input.checked));
console.log('確認済み12品・対象外データ保持・一度だけの更新・削除/休止/価格/独自タグ・履歴と未記録注文・旧/新バックアップ・補助タグ表示を確認しました。');
