const crypto = require("crypto");
const db = require("../db/postgres");

const record = async (admin, action, entityType, entityId, details = {}) => {
  try {
    await db.query(
      `INSERT INTO admin_audit_logs (id, admin_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), admin && admin.id ? admin.id : null, action, entityType, entityId || null, JSON.stringify(details || {})]
    );
  } catch (error) {
    // Auditing should never make a successful business action fail.
    console.error("Could not write admin audit log", error);
  }
};

const listRecent = async (limit = 100) => {
  const result = await db.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at,
            a.name AS admin_name, a.email AS admin_email
     FROM admin_audit_logs l
     LEFT JOIN admin_users a ON a.id = l.admin_user_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [Math.min(200, Math.max(1, Number(limit) || 100))]
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details || {},
    createdAt: row.created_at,
    adminName: row.admin_name || row.admin_email || "Unknown admin",
  }));
};

module.exports = { listRecent, record };
