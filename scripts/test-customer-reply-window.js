const assert = require("node:assert/strict");
const { CUSTOMER_REPLY_WINDOW_MS, getLastInboundMessageTimestamp, isReplyWindowOpen } = require("../services/customerReplyWindow.service");

process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const now = Date.now();
const inboundAt = now - 60 * 60 * 1000;
const rows = [
  ...Array.from({ length: 100 }, (_, index) => ({ message: "", created_at: new Date(now - index * 1000).toISOString() })),
  { message: "Customer question", created_at: new Date(inboundAt).toISOString() }
];

global.fetch = async (input) => {
  const query = new URL(input).searchParams;
  assert.equal(query.get("brand_id"), "eq.test-brand");
  assert.equal(query.get("customer_id"), "eq.test-customer");
  assert(["eq.whatsapp", "eq.instagram"].includes(query.get("channel")));
  assert.equal(query.get("message"), "neq.");
  const filtered = query.get("message") === "neq." ? rows.filter((row) => row.message !== "") : rows;
  return new Response(JSON.stringify(filtered.slice(0, Number(query.get("limit")))), { status: 200 });
};

async function run() {
  for (const channel of ["whatsapp", "instagram"]) {
    const timestamp = await getLastInboundMessageTimestamp({ brandId: "test-brand", customerId: "test-customer", channel });
    assert.equal(timestamp, inboundAt, `${channel}: 100 outbound replies must not conceal the inbound message`);
    assert.equal(isReplyWindowOpen(timestamp, now), true);
  }
  assert.equal(isReplyWindowOpen(now - CUSTOMER_REPLY_WINDOW_MS + 1, now), true);
  assert.equal(isReplyWindowOpen(now - CUSTOMER_REPLY_WINDOW_MS, now), false);
  assert.equal(isReplyWindowOpen(now - CUSTOMER_REPLY_WINDOW_MS - 1, now), false);
  assert.equal(isReplyWindowOpen(NaN, now), false);
  assert.equal(isReplyWindowOpen(null, now), false);
  assert.equal(isReplyWindowOpen(now + 1, now), false);
  global.fetch = async () => new Response("[]", { status: 200 });
  assert.equal(await getLastInboundMessageTimestamp({ brandId: "test-brand", customerId: "test-customer", channel: "instagram" }), null);
  global.fetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(getLastInboundMessageTimestamp({ brandId: "test-brand", customerId: "test-customer", channel: "whatsapp" }), { code: "reply_window_check_failed" });
  console.log("PASS both channels: inbound lookup after 100 outbound replies, brand/customer/channel filters, exact 23-hour cutoff, missing/invalid timestamps and storage failure.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
