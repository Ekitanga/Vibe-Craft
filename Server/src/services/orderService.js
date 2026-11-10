const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const { getProductById } = require("./productService");
const { getConfiguredDeliveryFee, isDeliveryCountyAvailable } = require("./siteSettingsService");
const { applyPromotion } = require("./promotionService");
const integrationSettings = require("./integrationSettingsService");

const allowedStatuses = ["pending", "confirmed", "processing", "completed", "cancelled"];
const MAX_LINES = 20;
const MAX_QUANTITY_PER_LINE = 50;

const getOrderNumber = (id) => `VC-${String(id || "").replace(/-/g, "").slice(-8).toUpperCase()}`;

const ORDER_COLUMNS = `
  o.id, o.customer_id, o.customer_account_id, o.notes, o.status, o.total, o.delivery_fee, o.promotion_code,
  o.discount_amount, o.currency, o.delivery_county, o.delivery_town, o.delivery_address, o.delivery_landmark,
  o.preferred_delivery_date, o.preferred_delivery_time, o.mpesa_code, o.payment_verified, o.payment_verified_at,
  o.fulfillment, o.attribution, o.cancel_reason, o.created_at, o.updated_at,
  c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.location AS customer_location`;

const mapOrderRow = (row) => ({
  id: row.id,
  orderNumber: getOrderNumber(row.id),
  customerAccountId: row.customer_account_id || null,
  customer: {
    id: row.customer_id,
    name: row.customer_name,
    phone: row.customer_phone,
    email: row.customer_email,
    location: row.customer_location,
  },
  items: [],
  notes: row.notes || "",
  status: row.status,
  fulfillment: row.fulfillment || "delivery",
  total: Number(row.total || 0),
  subtotal: Math.max(0, Number(row.total || 0) - Number(row.delivery_fee || 0) + Number(row.discount_amount || 0)),
  deliveryFee: Number(row.delivery_fee || 0),
  promotionCode: row.promotion_code || null,
  discountAmount: Number(row.discount_amount || 0),
  currency: row.currency,
  delivery: {
    county: row.delivery_county,
    town: row.delivery_town,
    address: row.delivery_address,
    landmark: row.delivery_landmark,
    preferredDate: row.preferred_delivery_date,
    preferredTime: row.preferred_delivery_time,
  },
  mpesaCode: row.mpesa_code,
  paymentVerified: row.payment_verified,
  paymentVerifiedAt: row.payment_verified_at || null,
  cancelReason: row.cancel_reason || null,
  attribution: row.attribution || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  inquiryAnswers: [],
  recommendations: [],
});

// Customer-facing view: internal tracking data stays on the server.
const publicOrder = (order) => {
  if (!order) return order;
  const { attribution, ...rest } = order;
  return rest;
};

const text = (value, max) => {
  const cleaned = String(value === undefined || value === null ? "" : value).trim();
  if (cleaned.length > max) throw new HttpError(400, `A field is too long (maximum ${max} characters).`);
  return cleaned;
};

const phoneDigits = (phone) => String(phone || "").replace(/\D/g, "");

const validateCustomer = (customer = {}) => {
  const missingFields = ["name", "phone"].filter((field) => !customer[field] || !String(customer[field]).trim());
  if (missingFields.length > 0) throw new HttpError(400, "Missing required customer fields", missingFields);

  const name = text(customer.name, 100);
  const phone = text(customer.phone, 30);
  const email = text(customer.email, 254).toLowerCase();
  if (name.length < 2) throw new HttpError(400, "Please enter your full name.");
  const digits = phoneDigits(phone);
  if (digits.length < 9 || digits.length > 15) throw new HttpError(400, "Please enter a valid phone number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  return { name, phone, email: email || null, location: text(customer.location, 200) || null };
};

const validateDelivery = (delivery = {}, { required }) => {
  if (required) {
    const missingFields = ["county", "town", "address"].filter((field) => !delivery[field] || !String(delivery[field]).trim());
    if (missingFields.length > 0) throw new HttpError(400, "Missing required delivery fields", missingFields);
  }
  const preferredDate = delivery.preferredDate ? text(delivery.preferredDate, 10) : null;
  if (preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) throw new HttpError(400, "Preferred delivery date is invalid.");
  return {
    county: text(delivery.county, 60) || null,
    town: text(delivery.town, 120) || null,
    address: text(delivery.address, 300) || null,
    landmark: text(delivery.landmark, 200) || null,
    preferredDate,
    preferredTime: text(delivery.preferredTime, 60) || null,
  };
};

const normalizeItems = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "Order must include at least one item");
  if (items.length > MAX_LINES) throw new HttpError(400, `An order can include at most ${MAX_LINES} different products.`);

  // Merge duplicate lines so per-product stock checks are accurate.
  const quantities = new Map();
  for (const item of items) {
    const productId = item && typeof item.productId === "string" ? item.productId : "";
    if (!productId || productId.length > 100) throw new HttpError(400, "Order item is missing a valid product.");
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, "Order item quantity must be a whole number of at least 1");
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  const normalizedItems = [];
  for (const [productId, quantity] of quantities) {
    if (quantity > MAX_QUANTITY_PER_LINE) throw new HttpError(400, `You can order at most ${MAX_QUANTITY_PER_LINE} of one product online. Call us for bulk orders.`);
    const product = await getProductById(productId);
    if (product.stock < quantity) throw new HttpError(400, `${product.name} has only ${product.stock} item(s) in stock`);
    normalizedItems.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    });
  }
  return normalizedItems;
};

const cleanAttribution = (input, context = {}) => {
  const source = input && typeof input === "object" ? input : {};
  const pick = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);
  const touch = (value) => {
    if (!value || typeof value !== "object") return undefined;
    const result = {
      utm_source: pick(value.utm_source, 150),
      utm_medium: pick(value.utm_medium, 150),
      utm_campaign: pick(value.utm_campaign, 150),
      utm_content: pick(value.utm_content, 150),
      utm_term: pick(value.utm_term, 150),
      fbclid: pick(value.fbclid, 500),
      landingPage: pick(value.landingPage, 500),
      referrer: pick(value.referrer, 500),
      at: pick(value.at, 40),
    };
    Object.keys(result).forEach((key) => result[key] === undefined && delete result[key]);
    return Object.keys(result).length ? result : undefined;
  };
  const cookies = context.cookies || {};
  const result = {
    first: touch(source.first),
    last: touch(source.last),
    fbp: pick(cookies._fbp, 200),
    fbc: pick(cookies._fbc, 600),
    userAgent: pick(context.userAgent, 400),
    checkoutUrl: pick(source.checkoutUrl, 500),
  };
  const lastTouch = result.last || result.first || {};
  if (lastTouch.fbclid) result.fbclid = lastTouch.fbclid;
  Object.keys(result).forEach((key) => result[key] === undefined && delete result[key]);
  return result;
};

const hydrateOrderDetails = async (orders) => {
  const ids = orders.map((order) => order.id);
  const byId = new Map(orders.map((order) => [order.id, order]));
  if (!ids.length) return orders;

  const [itemsResult, answersResult, recommendationsResult] = await Promise.all([
    db.query(
      `SELECT order_id, product_id, product_name, quantity, unit_price, line_total
       FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY id ASC`,
      [ids]
    ),
    db.query(
      `SELECT order_id, question_key, question_label, answer_value, answer_label
       FROM inquiry_answers WHERE order_id = ANY($1::text[]) ORDER BY sort_order ASC, id ASC`,
      [ids]
    ),
    db.query(
      `SELECT order_id, product_id, product_name
       FROM order_recommendations WHERE order_id = ANY($1::text[]) ORDER BY sort_order ASC, id ASC`,
      [ids]
    ),
  ]);

  itemsResult.rows.forEach((row) => {
    byId.get(row.order_id)?.items.push({
      productId: row.product_id,
      name: row.product_name,
      quantity: Number(row.quantity || 0),
      unitPrice: Number(row.unit_price || 0),
      lineTotal: Number(row.line_total || 0),
    });
  });
  answersResult.rows.forEach((row) => {
    byId.get(row.order_id)?.inquiryAnswers.push({
      questionKey: row.question_key,
      questionLabel: row.question_label,
      answerValue: row.answer_value,
      answerLabel: row.answer_label,
    });
  });
  recommendationsResult.rows.forEach((row) => {
    byId.get(row.order_id)?.recommendations.push({ productId: row.product_id, productName: row.product_name });
  });
  return orders;
};

const listOrders = async ({ since, until } = {}) => {
  const params = [];
  const where = [];
  if (since) {
    params.push(since);
    where.push(`o.created_at >= $${params.length}`);
  }
  if (until) {
    params.push(until);
    where.push(`o.created_at < $${params.length}`);
  }
  const result = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o JOIN customers c ON c.id = o.customer_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY o.created_at DESC`,
    params
  );
  return hydrateOrderDetails(result.rows.map(mapOrderRow));
};

// Guest orders placed with the same email are only shown once the account has proven
// it owns that email (Google sign-in or the verification link). Previously anyone who
// signed up with someone else's email could read their orders.
const listOrdersForAccount = async ({ accountId, email, emailVerified }) => {
  const result = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.customer_account_id = $1
        OR ($3::boolean AND o.customer_account_id IS NULL AND LOWER(c.email) = LOWER($2))
     ORDER BY o.created_at DESC`,
    [accountId, email || "", Boolean(emailVerified)]
  );
  return (await hydrateOrderDetails(result.rows.map(mapOrderRow))).map(publicOrder);
};

const getOrderById = async (id) => {
  const result = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new HttpError(404, "Order not found");
  const orders = await hydrateOrderDetails([mapOrderRow(result.rows[0])]);
  return orders[0];
};

const countOpenOrdersForPhone = async (phone) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE right(regexp_replace(c.phone, '\\D', '', 'g'), 9) = right($1, 9)
       AND o.status = 'pending' AND o.payment_verified = FALSE
       AND o.created_at > NOW() - INTERVAL '7 days'`,
    [phoneDigits(phone)]
  );
  return result.rows[0].count;
};

// Side effects (email, Meta, M-Pesa) are registered by app wiring to avoid import cycles.
const hooks = { orderCreated: [], orderPaid: [] };
const onOrderCreated = (fn) => hooks.orderCreated.push(fn);
const onOrderPaid = (fn) => hooks.orderPaid.push(fn);
const runHooks = (list, ...args) => {
  list.forEach((fn) => {
    Promise.resolve()
      .then(() => fn(...args))
      .catch((error) => console.error("[orders] hook failed:", error.message));
  });
};

const isPickupRequest = (payload) =>
  payload.fulfillment === "pickup" || (!payload.fulfillment && String(payload.notes || "").trim().startsWith("Pickup requested"));

const createOrder = async (payload = {}, context = {}) => {
  const { customerAccountId = null, ip = null } = typeof context === "string" || context === null ? { customerAccountId: context } : context;
  const customer = validateCustomer(payload.customer);
  const isPickup = isPickupRequest(payload);
  const delivery = validateDelivery(payload.delivery || {}, { required: !isPickup });
  const notes = text(payload.notes, 1000);
  const mpesaCode = text(payload.mpesaCode, 30).replace(/\s+/g, "").toUpperCase() || null;
  if (mpesaCode && !/^[A-Z0-9]{8,12}$/.test(mpesaCode)) throw new HttpError(400, "The M-Pesa code looks invalid. It is usually 10 letters and numbers.");

  const security = await integrationSettings.getConfig("security");
  const maxOpen = Number(security.maxPendingOrdersPerPhone || 0);
  if (maxOpen > 0 && (await countOpenOrdersForPhone(customer.phone)) >= maxOpen) {
    throw new HttpError(
      429,
      "You already have orders waiting for confirmation. We'll be in touch shortly — or call/WhatsApp us to add to them."
    );
  }

  const items = await normalizeItems(payload.items);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  if (!isPickup && !(await isDeliveryCountyAvailable(delivery.county))) {
    throw new HttpError(400, "We do not currently deliver to that county.");
  }
  // Pickup is collected in store: no delivery fee (matches what checkout shows the customer).
  const deliveryFee = isPickup ? 0 : await getConfiguredDeliveryFee(delivery.county, subtotal);

  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const location = customer.location || [delivery.town, delivery.county].filter(Boolean).join(", ");
  const attribution = cleanAttribution(payload.attribution, context);

  await db.withTransaction(async (client) => {
    const promotion = await applyPromotion(client, payload.promotionCode, subtotal);
    const total = Math.max(0, subtotal + deliveryFee - promotion.discountAmount);
    await client.query(
      `INSERT INTO customers (id, name, phone, email, location) VALUES ($1, $2, $3, $4, $5)`,
      [customerId, customer.name, customer.phone, customer.email, location || null]
    );

    await client.query(
      `INSERT INTO orders (
        id, customer_id, customer_account_id, notes, status, total, currency, delivery_fee, promotion_code, discount_amount,
        delivery_county, delivery_town, delivery_address, delivery_landmark,
        preferred_delivery_date, preferred_delivery_time, mpesa_code, fulfillment, attribution, client_ip, meta_event_id
      )
       VALUES ($1, $2, $3, $4, 'pending', $5, 'KES', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19)`,
      [
        orderId, customerId, customerAccountId || null, notes, total, deliveryFee, promotion.code, promotion.discountAmount,
        delivery.county, delivery.town, delivery.address, delivery.landmark, delivery.preferredDate, delivery.preferredTime,
        mpesaCode, isPickup ? "pickup" : "delivery", JSON.stringify(attribution), ip, `purchase_${orderId}`,
      ]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), orderId, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal]
      );
      const stockUpdate = await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock`,
        [item.quantity, item.productId]
      );
      if (!stockUpdate.rows[0]) throw new HttpError(409, `${item.name} no longer has enough stock available.`);
    }

    if (Array.isArray(payload.inquiryAnswers)) {
      for (const [index, answer] of payload.inquiryAnswers.slice(0, 30).entries()) {
        if (!answer || typeof answer !== "object") continue;
        await client.query(
          `INSERT INTO inquiry_answers (id, order_id, question_key, question_label, answer_value, answer_label, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(), orderId,
            String(answer.questionKey || answer.key || "").slice(0, 100),
            String(answer.questionLabel || answer.label || "").slice(0, 300),
            answer.answerValue || answer.value ? String(answer.answerValue || answer.value).slice(0, 500) : null,
            answer.answerLabel || answer.answer ? String(answer.answerLabel || answer.answer).slice(0, 500) : null,
            index,
          ]
        );
      }
    }

    if (Array.isArray(payload.recommendations)) {
      for (const [index, recommendation] of payload.recommendations.slice(0, 20).entries()) {
        if (!recommendation || typeof recommendation !== "object") continue;
        await client.query(
          `INSERT INTO order_recommendations (id, order_id, product_id, product_name, sort_order)
           SELECT $1, $2, p.id, $4, $5 FROM (SELECT $3::text AS wanted) w LEFT JOIN products p ON p.id = w.wanted`,
          [
            crypto.randomUUID(), orderId,
            recommendation.productId ? String(recommendation.productId).slice(0, 100) : null,
            String(recommendation.productName || recommendation.name || "Recommended product").slice(0, 200),
            index,
          ]
        );
      }
    }
  });

  const order = await getOrderById(orderId);
  runHooks(hooks.orderCreated, order, context);
  return order;
};

const releasePromotion = async (client, orderId) => {
  const result = await client.query(
    `UPDATE orders SET promotion_released = TRUE WHERE id = $1 AND promotion_code IS NOT NULL AND promotion_released = FALSE RETURNING promotion_code`,
    [orderId]
  );
  if (result.rows[0]) {
    await client.query(
      `UPDATE promotions SET used_count = GREATEST(0, used_count - 1) WHERE code = $1`,
      [result.rows[0].promotion_code]
    );
  }
};

const reclaimPromotion = async (client, orderId) => {
  const result = await client.query(
    `UPDATE orders SET promotion_released = FALSE WHERE id = $1 AND promotion_code IS NOT NULL AND promotion_released = TRUE RETURNING promotion_code`,
    [orderId]
  );
  if (result.rows[0]) {
    await client.query(`UPDATE promotions SET used_count = used_count + 1 WHERE code = $1`, [result.rows[0].promotion_code]);
  }
};

const restockOrderItems = async (client, orderId) => {
  const items = await client.query(
    `SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );
  for (const item of items.rows) {
    await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [item.quantity, item.product_id]);
  }
};

const reserveOrderItems = async (client, orderId) => {
  const items = await client.query(
    `SELECT product_id, product_name, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );
  for (const item of items.rows) {
    const stockUpdate = await client.query(
      `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock`,
      [item.quantity, item.product_id]
    );
    if (!stockUpdate.rows[0]) throw new HttpError(409, `${item.product_name} doesn't have enough stock to reactivate this order.`);
  }
};

const updateOrderStatus = async (id, status, { reason } = {}) => {
  if (!allowedStatuses.includes(status)) throw new HttpError(400, "Invalid order status", allowedStatuses);

  await db.withTransaction(async (client) => {
    const orderResult = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [id]);
    if (!orderResult.rows[0]) throw new HttpError(404, "Order not found");
    const previousStatus = orderResult.rows[0].status;

    if (previousStatus !== status) {
      const wasCancelled = previousStatus === "cancelled";
      const willBeCancelled = status === "cancelled";
      if (willBeCancelled && !wasCancelled) {
        await restockOrderItems(client, id);
        await releasePromotion(client, id);
      } else if (wasCancelled && !willBeCancelled) {
        await reserveOrderItems(client, id);
        await reclaimPromotion(client, id);
      }
    }

    await client.query(
      `UPDATE orders SET status = $1, cancel_reason = CASE WHEN $1 = 'cancelled' THEN $3 ELSE NULL END WHERE id = $2`,
      [status, id, reason || null]
    );
  });

  return getOrderById(id);
};

const updatePaymentVerification = async (id, verified) => {
  const result = await db.query(
    `WITH previous AS (SELECT payment_verified FROM orders WHERE id = $2)
     UPDATE orders SET payment_verified = $1,
       payment_verified_at = CASE WHEN $1 THEN COALESCE(payment_verified_at, NOW()) ELSE NULL END
     WHERE id = $2 RETURNING id, (SELECT payment_verified FROM previous) AS was_verified`,
    [Boolean(verified), id]
  );
  if (!result.rows[0]) throw new HttpError(404, "Order not found");
  const order = await getOrderById(id);
  if (order.paymentVerified && !result.rows[0].was_verified) runHooks(hooks.orderPaid, order, { source: "admin" });
  return order;
};

// Called by the M-Pesa callback once Safaricom confirms a payment.
const markOrderPaid = async (orderId, receipt) => {
  const result = await db.query(
    `UPDATE orders SET payment_verified = TRUE, payment_verified_at = COALESCE(payment_verified_at, NOW()),
       mpesa_code = COALESCE(NULLIF(mpesa_code, ''), $2),
       status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
     WHERE id = $1 AND payment_verified = FALSE RETURNING id`,
    [orderId, receipt]
  );
  if (!result.rows[0]) return null;
  const order = await getOrderById(orderId);
  runHooks(hooks.orderPaid, order, { source: "mpesa", receipt });
  return order;
};

// Cancels orders that nobody confirmed or paid within the configured window, returning
// their stock and promo uses. Stops fake orders from locking up inventory.
const expireStalePendingOrders = async () => {
  const security = await integrationSettings.getConfig("security");
  const hours = Number(security.pendingOrderExpiryHours || 0);
  if (hours <= 0) return { expired: 0 };

  let expired = 0;
  await db.withTransaction(async (client) => {
    const stale = await client.query(
      `SELECT id FROM orders
       WHERE status = 'pending' AND payment_verified = FALSE AND created_at < NOW() - make_interval(hours => $1)
       ORDER BY created_at ASC LIMIT 100
       FOR UPDATE SKIP LOCKED`,
      [hours]
    );
    for (const row of stale.rows) {
      await restockOrderItems(client, row.id);
      await releasePromotion(client, row.id);
      await client.query(
        `UPDATE orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`,
        [row.id, `Automatically cancelled: not confirmed or paid within ${hours} hours.`]
      );
      expired += 1;
    }
  });
  return { expired };
};

module.exports = {
  createOrder,
  expireStalePendingOrders,
  getOrderById,
  listOrders,
  listOrdersForAccount,
  markOrderPaid,
  onOrderCreated,
  onOrderPaid,
  publicOrder,
  updateOrderStatus,
  updatePaymentVerification,
};
