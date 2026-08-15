const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const { getProductById } = require("./productService");
const { getDeliveryFee } = require("../config/deliveryFees");

const allowedStatuses = ["pending", "confirmed", "processing", "completed", "cancelled"];

const getOrderNumber = (id) => `VC-${String(id || "").replace(/-/g, "").slice(-8).toUpperCase()}`;

const mapOrderRow = (row) => ({
  id: row.id,
  orderNumber: getOrderNumber(row.id),
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
  total: Number(row.total || 0),
  subtotal: Math.max(0, Number(row.total || 0) - Number(row.delivery_fee || 0)),
  deliveryFee: Number(row.delivery_fee || 0),
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  inquiryAnswers: [],
  recommendations: [],
});

const validateCustomer = (customer = {}) => {
  const missingFields = ["name", "phone"].filter((field) => !customer[field]);

  if (missingFields.length > 0) {
    throw new HttpError(400, "Missing required customer fields", missingFields);
  }
};

const validateDelivery = (delivery = {}) => {
  const missingFields = ["county", "town", "address"].filter((field) => !delivery[field]);

  if (missingFields.length > 0) {
    throw new HttpError(400, "Missing required delivery fields", missingFields);
  }
};

const normalizeItems = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Order must include at least one item");
  }

  const normalizedItems = [];

  for (const item of items) {
    const product = await getProductById(item.productId);
    const quantity = Number(item.quantity || 1);

    if (quantity < 1) {
      throw new HttpError(400, "Order item quantity must be at least 1");
    }

    if (product.stock < quantity) {
      throw new HttpError(400, `${product.name} has only ${product.stock} item(s) in stock`);
    }

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

const hydrateOrderDetails = async (orders) => {
  const ids = orders.map((order) => order.id);
  const byId = new Map(
    orders.map((order) => {
      return [order.id, order];
    })
  );

  if (!ids.length) {
    return orders;
  }

  const [itemsResult, answersResult, recommendationsResult] = await Promise.all([
    db.query(
      `SELECT order_id, product_id, product_name, quantity, unit_price, line_total
       FROM order_items
       WHERE order_id = ANY($1::text[])
       ORDER BY id ASC`,
      [ids]
    ),
    db.query(
      `SELECT order_id, question_key, question_label, answer_value, answer_label
       FROM inquiry_answers
       WHERE order_id = ANY($1::text[])
       ORDER BY sort_order ASC, id ASC`,
      [ids]
    ),
    db.query(
      `SELECT order_id, product_id, product_name
       FROM order_recommendations
       WHERE order_id = ANY($1::text[])
       ORDER BY sort_order ASC, id ASC`,
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
    byId.get(row.order_id)?.recommendations.push({
      productId: row.product_id,
      productName: row.product_name,
    });
  });

  return orders;
};

const listOrders = async () => {
  const result = await db.query(
    `SELECT
      o.id,
      o.customer_id,
      o.notes,
      o.status,
      o.total,
      o.delivery_fee,
      o.currency,
      o.delivery_county,
      o.delivery_town,
      o.delivery_address,
      o.delivery_landmark,
      o.preferred_delivery_date,
      o.preferred_delivery_time,
      o.mpesa_code,
      o.payment_verified,
      o.created_at,
      o.updated_at,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.email AS customer_email,
      c.location AS customer_location
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC`
  );
  const orders = result.rows.map(mapOrderRow);

  return hydrateOrderDetails(orders);
};

const listOrdersForAccount = async ({ accountId, email }) => {
  const result = await db.query(
    `SELECT
      o.id,
      o.customer_id,
      o.notes,
      o.status,
      o.total,
      o.delivery_fee,
      o.currency,
      o.delivery_county,
      o.delivery_town,
      o.delivery_address,
      o.delivery_landmark,
      o.preferred_delivery_date,
      o.preferred_delivery_time,
      o.mpesa_code,
      o.payment_verified,
      o.created_at,
      o.updated_at,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.email AS customer_email,
      c.location AS customer_location
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.customer_account_id = $1
       OR (o.customer_account_id IS NULL AND LOWER(c.email) = LOWER($2))
    ORDER BY o.created_at DESC`,
    [accountId, email || ""]
  );
  const orders = result.rows.map(mapOrderRow);

  return hydrateOrderDetails(orders);
};

const getOrderById = async (id) => {
  const result = await db.query(
    `SELECT
      o.id,
      o.customer_id,
      o.notes,
      o.status,
      o.total,
      o.delivery_fee,
      o.currency,
      o.delivery_county,
      o.delivery_town,
      o.delivery_address,
      o.delivery_landmark,
      o.preferred_delivery_date,
      o.preferred_delivery_time,
      o.mpesa_code,
      o.payment_verified,
      o.created_at,
      o.updated_at,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.email AS customer_email,
      c.location AS customer_location
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = $1`,
    [id]
  );

  if (!result.rows[0]) {
    throw new HttpError(404, "Order not found");
  }

  const orders = await hydrateOrderDetails([mapOrderRow(result.rows[0])]);

  return orders[0];
};

const createOrder = async (payload, customerAccountId) => {
  validateCustomer(payload.customer);
  validateDelivery(payload.delivery);

  const items = await normalizeItems(payload.items);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const delivery = payload.delivery || {};
  const deliveryFee = getDeliveryFee(delivery.county);
  const total = subtotal + deliveryFee;
  const location = payload.customer.location || [delivery.town, delivery.county].filter(Boolean).join(", ");

  await db.withTransaction(async (client) => {
    await client.query(
      `INSERT INTO customers (id, name, phone, email, location)
       VALUES ($1, $2, $3, $4, $5)`,
      [customerId, payload.customer.name, payload.customer.phone, payload.customer.email || null, location || null]
    );

    await client.query(
      `INSERT INTO orders (
        id, customer_id, customer_account_id, notes, status, total, currency, delivery_fee,
        delivery_county, delivery_town, delivery_address, delivery_landmark,
        preferred_delivery_date, preferred_delivery_time, mpesa_code
      )
       VALUES ($1, $2, $3, $4, 'pending', $5, 'KES', $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        orderId,
        customerId,
        customerAccountId || null,
        payload.notes || "",
        total,
        deliveryFee,
        delivery.county,
        delivery.town,
        delivery.address,
        delivery.landmark || null,
        delivery.preferredDate || null,
        delivery.preferredTime || null,
        payload.mpesaCode || null,
      ]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (
          id,
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          line_total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), orderId, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal]
      );

      const stockUpdate = await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock`,
        [item.quantity, item.productId]
      );

      if (!stockUpdate.rows[0]) {
        throw new HttpError(409, `${item.name} no longer has enough stock available.`);
      }
    }

    if (Array.isArray(payload.inquiryAnswers)) {
      for (const [index, answer] of payload.inquiryAnswers.entries()) {
        await client.query(
          `INSERT INTO inquiry_answers (
            id,
            order_id,
            question_key,
            question_label,
            answer_value,
            answer_label,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            orderId,
            answer.questionKey || answer.key || "",
            answer.questionLabel || answer.label || "",
            answer.answerValue || answer.value || null,
            answer.answerLabel || answer.answer || null,
            index,
          ]
        );
      }
    }

    if (Array.isArray(payload.recommendations)) {
      for (const [index, recommendation] of payload.recommendations.entries()) {
        await client.query(
          `INSERT INTO order_recommendations (id, order_id, product_id, product_name, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            crypto.randomUUID(),
            orderId,
            recommendation.productId || null,
            recommendation.productName || recommendation.name || "Recommended product",
            index,
          ]
        );
      }
    }
  });

  return getOrderById(orderId);
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

    if (!stockUpdate.rows[0]) {
      throw new HttpError(409, `${item.product_name} doesn't have enough stock to reactivate this order.`);
    }
  }
};

const updateOrderStatus = async (id, status) => {
  if (!allowedStatuses.includes(status)) {
    throw new HttpError(400, "Invalid order status", allowedStatuses);
  }

  await db.withTransaction(async (client) => {
    const orderResult = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [id]);

    if (!orderResult.rows[0]) {
      throw new HttpError(404, "Order not found");
    }

    const previousStatus = orderResult.rows[0].status;

    if (previousStatus !== status) {
      const wasCancelled = previousStatus === "cancelled";
      const willBeCancelled = status === "cancelled";

      if (willBeCancelled && !wasCancelled) {
        await restockOrderItems(client, id);
      } else if (wasCancelled && !willBeCancelled) {
        await reserveOrderItems(client, id);
      }
    }

    await client.query(`UPDATE orders SET status = $1 WHERE id = $2`, [status, id]);
  });

  return getOrderById(id);
};

const updatePaymentVerification = async (id, verified) => {
  const result = await db.query(`UPDATE orders SET payment_verified = $1 WHERE id = $2 RETURNING id`, [
    Boolean(verified),
    id,
  ]);

  if (!result.rows[0]) {
    throw new HttpError(404, "Order not found");
  }

  return getOrderById(id);
};

module.exports = {
  listOrders,
  listOrdersForAccount,
  createOrder,
  updateOrderStatus,
  updatePaymentVerification,
};
