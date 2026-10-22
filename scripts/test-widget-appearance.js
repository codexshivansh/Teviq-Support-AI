const assert = require("node:assert/strict");
const { DEFAULT_APPEARANCE, validateAppearance } = require("../services/widgetAppearance");
const { normalizeBrand } = require("../services/brand.service");
assert.deepEqual(validateAppearance(DEFAULT_APPEARANCE), DEFAULT_APPEARANCE);
for (const bad of [{ width: 900 }, { radius: -1 }, { font: "url(evil)" }, { logoUrl: "javascript:alert(1)" }, { backgroundColor: "red;display:none" }, { allowResize: "false" }, JSON.parse('{"__proto__":{}}')]) {
  assert.throws(() => validateAppearance(bad), error => error.statusCode === 400);
}
const row = { id: "test-brand", brand_name: "Test", is_active: true };
assert.equal(normalizeBrand(row).widgetConfig.appearance.backgroundColor, "#fffefa");
assert.equal(normalizeBrand({ ...row, widget_appearance: { headerTitle: "Shop helper" } }).widgetConfig.appearance.headerTitle, "Shop helper");
assert.equal(normalizeBrand(row).widgetConfig.appearance.headerTitle, "Teviq AI Assistant");
console.log("PASS appearance validation, defaults and per-brand isolation");
