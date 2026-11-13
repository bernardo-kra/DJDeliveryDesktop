const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowLayout } = require('../src/window-layout.cjs');

test('janelas lado a lado cabem na área útil sem se sobrepor, inclusive em outro monitor', () => {
  for (const width of [1252, 1440, 1920]) {
    const area = { x: -1920, y: 40, width, height: 900 };
    const layout = windowLayout(area);
    assert.ok(layout.dashboard.width >= 680);
    assert.ok(layout.catalog.width >= 560);
    assert.ok(layout.dashboard.x + layout.dashboard.width < layout.catalog.x);
    assert.equal(layout.catalog.x + layout.catalog.width, area.x + area.width);
    assert.equal(layout.dashboard.y, area.y);
  }
});

test('telas pequenas permitem alternar sem forçar janelas a sair da tela', () => {
  assert.equal(windowLayout({ x: 0, y: 0, width: 1024, height: 768 }), null);
  assert.equal(windowLayout({ x: 0, y: 0, width: 1920, height: 500 }), null);
});
