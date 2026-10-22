const DEFAULT_APPEARANCE = Object.freeze({
  backgroundColor: "#fffefa", textColor: "#211f1c", mutedColor: "#77736d",
  headerColor: "#fffefa", borderColor: "#e8e5df", botBubbleColor: "#f5f3ef",
  headerTitle: "Teviq AI Assistant", statusText: "Available now", logoUrl: "",
  font: "serif", position: "bottom-right", radius: 26, width: 420, height: 660,
  allowResize: true, showBranding: true
});

function validateAppearance(value) {
  const fail = (key) => { const error = new Error(`Invalid widget appearance: ${key}`); error.statusCode = 400; throw error; };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected an object");
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULT_APPEARANCE, key)) fail(key);
    if (key.endsWith("Color")) {
      if (typeof item !== "string" || !/^#[0-9a-f]{6}$/i.test(item)) fail(key);
    } else if (["headerTitle", "statusText", "logoUrl"].includes(key)) {
      if (typeof item !== "string" || item.length > (key === "logoUrl" ? 2048 : 80)) fail(key);
      if (key === "logoUrl" && item) {
        try { const url = new URL(item); if (url.protocol !== "https:" || url.username || url.password) fail(key); } catch { fail(key); }
      }
    } else if (key === "font" && !["serif", "sans"].includes(item)) fail(key);
    else if (key === "position" && !["bottom-left", "bottom-right"].includes(item)) fail(key);
    else if (["allowResize", "showBranding"].includes(key) && typeof item !== "boolean") fail(key);
    else if (["radius", "width", "height"].includes(key)) {
      const limits = { radius: [0, 40], width: [320, 600], height: [420, 850] }[key];
      if (!Number.isInteger(item) || item < limits[0] || item > limits[1]) fail(key);
    }
    output[key] = item;
  }
  return output;
}

module.exports = { DEFAULT_APPEARANCE, validateAppearance };
