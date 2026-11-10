// Connects order events to email, Meta and M-Pesa. Each side effect is independent
// and failures are logged without affecting the order itself.
const orderService = require("./orderService");
const emailService = require("./emailService");
const metaService = require("./metaService");
const mpesaService = require("./mpesaService");
const integrationSettings = require("./integrationSettingsService");

let registered = false;

const register = () => {
  if (registered) return;
  registered = true;

  orderService.onOrderCreated(async (order, context = {}) => {
    await emailService.sendOrderEmails(order);

    const meta = await integrationSettings.getConfig("meta");
    if (meta.capiEnabled && (meta.purchaseTrigger || "placed") === "placed") {
      await metaService.sendPurchaseForOrder(order);
    }

    const mpesa = await integrationSettings.getConfig("mpesa");
    if (mpesa.enabled && mpesa.autoPromptOnCheckout && !order.paymentVerified && context.baseUrl) {
      await mpesaService.requestPayment({ orderId: order.id, phone: order.customer.phone, baseUrl: context.baseUrl });
    }
  });

  orderService.onOrderPaid(async (order, context = {}) => {
    await emailService.sendPaymentReceived(order, context.receipt);
    const meta = await integrationSettings.getConfig("meta");
    if (meta.capiEnabled && meta.purchaseTrigger === "verified") {
      await metaService.sendPurchaseForOrder(order);
    }
  });
};

module.exports = { register };
