// Only Teviq's canonical workspace may use Teviq's own sales playbook.
// A client being B2B or having a similar display name does not grant this scope.
function isTeviqSalesBrand(brandId) { return brandId === 'teviq'; }
module.exports = { isTeviqSalesBrand };
