const assert = require('node:assert/strict');
const express = require('express');
(async () => {
 const app = express();
 app.use(express.json({verify: (req,res,body) => {req.rawBody = body;}}));
 app.use('/billing', require('../routes/billing.routes'));
 app.use('/webhook', require('../routes/billingWebhook.routes'));
 const server = app.listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 const url = `http://127.0.0.1:${server.address().port}`;
 try {
  process.env.BILLING_TEST_ENABLED = 'false';
  assert.equal((await fetch(url+'/billing/plans')).status,503);
  process.env.BILLING_TEST_ENABLED = 'true'; process.env.NODE_ENV='production';
  assert.equal((await fetch(url+'/billing/plans')).status,503);
  process.env.NODE_ENV='test';
  assert.equal((await fetch(url+'/billing/plans')).status,403);
  assert.equal((await fetch(url+'/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  console.log('PASS disabled/production/unauthenticated gates and unsigned webhook rejection');
 } finally {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
