// Transactional email over SMTP, configured in Admin → Integrations → Email.
// Sending never blocks or fails the action that triggered it.
const nodemailer = require("nodemailer");
const HttpError = require("../utils/httpError");
const integrationSettings = require("./integrationSettingsService");
const siteSettingsService = require("./siteSettingsService");

let transportCache = null;

const escapeHtml = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getTransport = async () => {
  const config = await integrationSettings.getAll("email");
  if (!config.enabled || !config.host || !config.fromAddress) return null;

  const signature = JSON.stringify([config.host, config.port, config.secure, config.username, config.password]);
  if (transportCache && transportCache.signature === signature) return { transport: transportCache.transport, config };

  const transport = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port) || 587,
    secure: Boolean(config.secure),
    auth: config.username ? { user: config.username, pass: config.password || "" } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  transportCache = { signature, transport };
  return { transport, config };
};

const send = async ({ to, subject, text, html }) => {
  const ready = await getTransport();
  if (!ready || !to) return { sent: false, reason: "Email is not configured." };
  const { transport, config } = ready;
  const from = config.fromName ? `"${String(config.fromName).replace(/["\r\n]/g, "")}" <${config.fromAddress}>` : config.fromAddress;
  await transport.sendMail({ from, to, subject: String(subject).replace(/[\r\n]+/g, " "), text, html });
  return { sent: true };
};

// Fire-and-forget wrapper used by business flows.
const sendQuietly = (message) => {
  send(message).catch((error) => console.error("[email] send failed:", error.message));
};

const layout = (storeName, bodyHtml) => `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;background:#f6f6f8;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 16px">${escapeHtml(storeName)}</h2>${bodyHtml}
</div></body></html>`;

const formatKes = (amount) => "KES " + Number(amount || 0).toLocaleString("en-KE");

const orderSummary = (order) => {
  const lines = (order.items || []).map((item) => `${item.quantity} × ${item.name} — ${formatKes(item.lineTotal)}`);
  if (order.deliveryFee) lines.push(`Delivery — ${formatKes(order.deliveryFee)}`);
  if (order.discountAmount) lines.push(`Discount (${order.promotionCode}) — −${formatKes(order.discountAmount)}`);
  lines.push(`Total — ${formatKes(order.total)}`);
  return lines;
};

const sendOrderEmails = async (order) => {
  const [config, settings] = await Promise.all([integrationSettings.getConfig("email"), siteSettingsService.getSettings()]);
  if (!config.enabled) return;
  const lines = orderSummary(order);
  const listHtml = "<ul>" + lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("") + "</ul>";

  if (config.sendOrderConfirmation && order.customer && order.customer.email) {
    sendQuietly({
      to: order.customer.email,
      subject: `Your ${settings.storeName} order ${order.orderNumber}`,
      text: [`Hi ${order.customer.name},`, "", `Thanks for your order ${order.orderNumber}. We'll contact you shortly to confirm.`, "", ...lines, "",
        `Pay via M-Pesa Paybill ${settings.paybill}, account ${settings.mpesaAccount}.`, `Questions? Call or WhatsApp ${settings.phone}.`].join("\n"),
      html: layout(settings.storeName, `<p>Hi ${escapeHtml(order.customer.name)},</p><p>Thanks for your order <strong>${escapeHtml(order.orderNumber)}</strong>. We'll contact you shortly to confirm.</p>${listHtml}
        <p>Pay via M-Pesa Paybill <strong>${escapeHtml(settings.paybill)}</strong>, account <strong>${escapeHtml(settings.mpesaAccount)}</strong>.</p>
        <p>Questions? Call or WhatsApp ${escapeHtml(settings.phone)}.</p>`),
    });
  }

  const recipients = (config.storeNotificationEmails || []).join(", ");
  if (config.sendNewOrderAlert && recipients) {
    const who = order.customer ? `${order.customer.name} (${order.customer.phone})` : "Customer";
    sendQuietly({
      to: recipients,
      subject: `New order ${order.orderNumber} — ${formatKes(order.total)}`,
      text: [`New order from ${who}`, `Fulfilment: ${order.fulfillment}`, "", ...lines].join("\n"),
      html: layout(settings.storeName, `<p>New order from <strong>${escapeHtml(who)}</strong> (${escapeHtml(order.fulfillment)}).</p>${listHtml}`),
    });
  }
};

const sendPaymentReceived = async (order, receipt) => {
  const [config, settings] = await Promise.all([integrationSettings.getConfig("email"), siteSettingsService.getSettings()]);
  if (!config.enabled || !order.customer || !order.customer.email) return;
  sendQuietly({
    to: order.customer.email,
    subject: `Payment received for ${order.orderNumber}`,
    text: `We've received your M-Pesa payment${receipt ? " (" + receipt + ")" : ""} for order ${order.orderNumber}. Thank you!`,
    html: layout(settings.storeName, `<p>We've received your M-Pesa payment${receipt ? " (<strong>" + escapeHtml(receipt) + "</strong>)" : ""} for order <strong>${escapeHtml(order.orderNumber)}</strong>. Thank you!</p>`),
  });
};

const sendVerificationEmail = async ({ to, name, link }) => {
  const [config, settings] = await Promise.all([integrationSettings.getConfig("email"), siteSettingsService.getSettings()]);
  if (!config.enabled || !config.sendEmailVerification) return { sent: false };
  return send({
    to,
    subject: `Confirm your email for ${settings.storeName}`,
    text: `Hi ${name},\n\nConfirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you didn't create an account, ignore this email.`,
    html: layout(settings.storeName, `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to see your order history and keep your account secure.</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Confirm email</a></p>
      <p style="color:#666;font-size:13px">The link is valid for 24 hours. If you didn't create an account, ignore this email.</p>`),
  });
};

const sendTestEmail = async (to) => {
  const ready = await getTransport();
  if (!ready) throw new HttpError(400, "Turn email on and fill in the SMTP host and From address first.");
  try {
    await ready.transport.verify();
    await send({ to, subject: "Vibecraft test email", text: "Your SMTP settings work.", html: "<p>Your SMTP settings work. ✅</p>" });
    return { ok: true, message: `Test email sent to ${to}.` };
  } catch (error) {
    throw new HttpError(400, "SMTP test failed: " + error.message);
  }
};

module.exports = { escapeHtml, send, sendOrderEmails, sendPaymentReceived, sendTestEmail, sendVerificationEmail };
