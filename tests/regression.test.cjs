const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function app() {
  const store = new Map(), elements = new Map();
  let quota = false;
  const localStorage = {
    get length() { return store.size; }, key(i) { return [...store.keys()][i]; },
    getItem(k) { return store.get(k) ?? null; },
    setItem(k, v) { if (quota) throw Error('quota'); store.set(k, v); },
    removeItem(k) { store.delete(k); }
  };
  const document = { createElement() { return { textContent: '', setAttribute() {} }; }, addEventListener() {}, getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', appendChild() {}, addEventListener() {} });
    return elements.get(id);
  } };
  const context = { window: { confirm: () => true }, document, localStorage, TextEncoder, setTimeout, clearTimeout };
  vm.createContext(context);
  let source = fs.readFileSync('script.js', 'utf8');
  const start = source.lastIndexOf('  loadLocal();\n  initAuth();');
  assert(start > 0);
  source = source.slice(0, start) + `
    render = function () {};
    window.test = { digits, q, save, addEntry, importLegacy, today, shift,
      weekChart, weekAnalysis, switchScope, handleUser, subLevel,
      loadLocal, flushPending, saveSettings,
      days: () => days, settings: () => settings, pending: () => pending,
      setDays: v => days = v, setSub: v => sub = v,
      setFs: v => fs = v, wait: () => writing };
  })();`;
  vm.runInContext(source, context);
  return { t: context.window.test, elements, store, quota: v => quota = v };
}

test('rejects signed, fractional, exponential and unsafe amounts', () => {
  const { t } = app();
  for (const value of ['-12.50', '12.50', '1e3', 'Infinity', '9999999999999999']) assert(Number.isNaN(t.digits(value)));
  assert.equal(t.digits('12 500'), 12500);
  assert.equal(t.digits(''), 0);
});
test('quota failures are visible and records remain available for backup', () => {
  const { t, elements, quota } = app(); quota(true);
  t.save(t.today(), [{ id: 'a', kind: 'sale', amount: 100, ts: Date.now() }]);
  assert.match(elements.get('status').textContent, /Saqlanmadi/);
  assert.equal(t.days()[t.today()][0].amount, 100);
});
test('account switches and logout isolate data, including undo state', () => {
  const { t } = app(); t.switchScope('A');
  t.save(t.today(), [{ id: 'a', kind: 'sale', amount: 100, ts: Date.now() }]);
  t.switchScope('B'); assert.equal(Object.keys(t.days()).length, 0);
  t.handleUser(null); assert.equal(Object.keys(t.days()).length, 0);
  t.switchScope('A'); assert.equal(t.days()[t.today()][0].amount, 100);
});
test('signed chart includes negative revenue and formula exports are neutralized', () => {
  const { t } = app(); t.setDays({ [t.today()]: [{ kind: 'ret', amount: 100, ts: Date.now() }] });
  assert.match(t.weekChart(), /-100/);
  for (const value of ['=1+1', '+SUM(A1)', '-1', '@SUM(A1)', ' =1']) assert(t.q(value).startsWith("'"));
  assert.equal(t.q('normal'), 'normal');
});
test('product names matching object prototypes remain in weekly analysis', () => {
  const { t } = app();
  t.setDays({ [t.today()]: [{ kind: 'sale', amount: 100, ts: Date.now(), note: '__proto__' }] });
  assert.match(t.weekAnalysis(), /__proto__/);
});
test('legacy migration is additive, repeatable and preserves source', () => {
  const { t, store } = app(), date = t.today();
  const raw = JSON.stringify([{ id: 'old', kind: 'sale', amount: 10, ts: Date.now() }]);
  store.set('kunlik-hisobot:' + date, raw); t.switchScope('A');
  assert.equal(Object.keys(t.days()).length, 0);
  t.importLegacy(); t.importLegacy();
  assert.equal(t.days()[date].length, 1);
  assert.equal(store.get('kunlik-hisobot:' + date), raw);
});
test('expired subscription returns Free', () => {
  const { t } = app(); t.setSub({ plan: 'max', exp: t.shift(t.today(), -1) });
  assert.equal(t.subLevel(), 0);
  t.setSub({ plan: 'max', exp: t.today() }); assert.equal(t.subLevel(), 2);
});
test('cloud snapshots preserve unsent additions; retries write entries individually', async () => {
  const { t, elements } = app(); let snapshot, rejectWrites = true; const writes = [];
  const db = {
    collection: name => ({
      onSnapshot(fn) { snapshot = fn; return () => {}; },
      doc(id) { return { set(v) { if (rejectWrites) return Promise.reject(Error('offline')); writes.push({ id, v }); return Promise.resolve(); }, delete() { return Promise.resolve(); } }; }
    }),
    doc: () => ({ onSnapshot() { return () => {}; } })
  };
  t.setFs({ collection: () => ({ doc: () => db }) }); t.switchScope('A');
  const date = t.shift(t.today(), -100), e = { id: 'a', kind: 'sale', amount: 10, ts: Date.now() };
  t.save(date, [e]); await t.wait();
  assert.match(elements.get('status').textContent, /Bulutga saqlanmadi/);
  snapshot({ forEach(fn) { fn({ data: () => ({ date, entry: { ...e, id: 'other', amount: 50 } }) }); } });
  assert.equal(t.days()[date].length, 2);
  rejectWrites = false; t.flushPending(); await t.wait();
  assert.equal(writes.length, 1); assert.equal(writes[0].id, 'a');
  assert.equal(Object.keys(t.pending()).length, 0);
});

test('complete application renders and handles sales, undo and all preview tiers', () => {
  const html = fs.readFileSync('index.html', 'utf8'), elements = new Map(), attrs = new Map();
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], {
    value: '', textContent: '', innerHTML: '', style: {}, children: [{}, {}, {}],
    addEventListener() {}, setAttribute(k,v) { this[k]=v; }, appendChild() {}, focus() {}, scrollIntoView() {}
  });
  let click;
  const store = new Map([['hisobot-pro-max:owner','f561d8db452ac29f56b2f444ba4be3135f0d713ed0be7e7db67fccbe597d990d']]);
  const document = {
    hidden: false, activeElement: null,
    documentElement: { setAttribute(k,v) { attrs.set(k,v); } },
    getElementById(id) { assert(elements.has(id), 'Missing HTML element: '+id); return elements.get(id); },
    createElement() { return { textContent: '', setAttribute() {} }; },
    addEventListener(name, fn) { if(name === 'click') click=fn; }
  };
  const context = { document, window: { addEventListener() {} }, TextEncoder,
    localStorage: { getItem:k=>store.get(k)??null, setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k) },
    setInterval() {}, setTimeout() { return 1; }, clearTimeout() {} };
  vm.createContext(context); vm.runInContext(fs.readFileSync('config.js','utf8'),context);
  vm.runInContext(fs.readFileSync('script.js','utf8'),context);
  const act=(action, values={})=>click({ target: { closest:()=>({getAttribute:k=>k==='data-act'?action:values[k]??null}) } });
  assert.equal(attrs.get('data-plan'),'max');
  elements.get('amount').value='10000'; elements.get('note').value='test'; act('add',{'data-kind':'sale'});
  assert.match(elements.get('heroVal').innerHTML,/10/); assert.equal(elements.get('logHint').textContent,'1 ta');
  const cached=JSON.parse(store.get('hpm:v2:guest')), entry=Object.values(cached.days)[0][0];
  act('del',{'data-id':entry.id}); assert.equal(elements.get('logHint').textContent,'');
  act('undo'); assert.equal(elements.get('logHint').textContent,'1 ta');
  for(const plan of ['free','pro','max']) { act('setplan',{'data-plan':plan}); assert.equal(attrs.get('data-plan'),plan); }
  assert.equal(elements.get('csvBtn').hidden,false);
});
