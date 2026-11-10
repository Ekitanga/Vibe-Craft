// Roles and permissions, stored in admin_roles and editable from the admin UI.
//
// Rules that keep the system safe however roles are edited:
//  * "owner" always has every permission and cannot be edited or deleted.
//  * Every role has a rank. An admin can only grant, edit or assign roles ranked below
//    their own, and can only manage admins ranked below themselves (owners excepted:
//    an owner can manage anyone, including other owners).
//  * Nobody can grant a permission they do not hold themselves.
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const { PERMISSIONS, PERMISSION_KEYS } = require("../config/permissions");

const CACHE_TTL_MS = 10 * 1000;
let cache = null;

const mapRole = (row) => ({
  key: row.key,
  name: row.name,
  description: row.description || "",
  rank: Number(row.rank),
  isSystem: Boolean(row.is_system),
  permissions: row.key === "owner" ? PERMISSION_KEYS.slice() : (row.permissions || []).filter((key) => PERMISSION_KEYS.includes(key)),
  memberCount: row.member_count === undefined ? undefined : Number(row.member_count),
});

const loadRoles = async () => {
  if (cache && cache.expiresAt > Date.now()) return cache.roles;
  const result = await db.query(
    `SELECT r.*, (SELECT COUNT(*) FROM admin_users u WHERE u.role = r.key) AS member_count
     FROM admin_roles r ORDER BY r.rank DESC, r.name ASC`
  );
  const roles = result.rows.map(mapRole);
  cache = { roles, expiresAt: Date.now() + CACHE_TTL_MS };
  return roles;
};

const clearCache = () => {
  cache = null;
};

const getRole = async (key) => (await loadRoles()).find((role) => role.key === key) || null;

const isOwner = (actor) => actor && actor.role === "owner";

// Describe an admin's effective access.
const describeAccess = async (roleKey) => {
  const role = await getRole(roleKey);
  if (!role) return { rank: 0, permissions: [] };
  return { rank: role.rank, permissions: role.permissions };
};

const hasPermission = (actor, permission) => Boolean(actor && Array.isArray(actor.permissions) && actor.permissions.includes(permission));

// Can `actor` assign `roleKey` to someone?
const canAssignRole = async (actor, roleKey) => {
  const role = await getRole(roleKey);
  if (!role) throw new HttpError(400, "That role does not exist.");
  if (isOwner(actor)) return role;
  if (role.rank >= actor.rank) {
    throw new HttpError(403, `You can only assign roles ranked below your own (${actor.roleName || actor.role}).`);
  }
  return role;
};

// Can `actor` manage (edit / disable / remove / reset) `target`?
const assertCanManage = (actor, target) => {
  if (!target) throw new HttpError(404, "Admin not found.");
  if (isOwner(actor)) return;
  if (Number(target.rank || 0) >= Number(actor.rank || 0)) {
    throw new HttpError(403, "You can only manage admins ranked below you.");
  }
};

const listRoles = async () => ({
  roles: await loadRoles(),
  permissions: PERMISSIONS,
});

const cleanPermissions = (actor, permissions) => {
  if (!Array.isArray(permissions)) throw new HttpError(400, "Permissions must be a list.");
  const unique = [...new Set(permissions.map(String))];
  const unknown = unique.filter((key) => !PERMISSION_KEYS.includes(key));
  if (unknown.length) throw new HttpError(400, "Unknown permission: " + unknown.join(", "));
  if (!isOwner(actor)) {
    const notHeld = unique.filter((key) => !actor.permissions.includes(key));
    if (notHeld.length) throw new HttpError(403, "You cannot grant permissions you do not have: " + notHeld.join(", "));
  }
  return unique;
};

const cleanRank = (actor, rank) => {
  const value = Number(rank);
  if (!Number.isInteger(value) || value < 1 || value > 99) throw new HttpError(400, "Rank must be a whole number from 1 to 99.");
  if (!isOwner(actor) && value >= actor.rank) throw new HttpError(403, "A role's rank must be below your own.");
  return value;
};

const cleanName = (name) => {
  const value = String(name || "").trim();
  if (value.length < 2 || value.length > 40) throw new HttpError(400, "Role name must be 2–40 characters.");
  return value;
};

const createRole = async (actor, input = {}) => {
  const name = cleanName(input.name);
  const key = String(input.key || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key)) throw new HttpError(400, "Role key must start with a letter and use letters, numbers or hyphens.");
  const permissions = cleanPermissions(actor, input.permissions || []);
  const rank = cleanRank(actor, input.rank === undefined ? 30 : input.rank);
  const description = String(input.description || "").trim().slice(0, 200);

  try {
    await db.query(
      `INSERT INTO admin_roles (key, name, description, permissions, rank, is_system)
       VALUES ($1, $2, $3, $4::jsonb, $5, FALSE)`,
      [key, name, description, JSON.stringify(permissions), rank]
    );
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "A role with that key already exists.");
    throw error;
  }
  clearCache();
  return getRole(key);
};

const updateRole = async (actor, key, input = {}) => {
  const role = await getRole(key);
  if (!role) throw new HttpError(404, "Role not found.");
  if (role.key === "owner") throw new HttpError(400, "The owner role always has full access and cannot be changed.");
  if (!isOwner(actor) && role.rank >= actor.rank) throw new HttpError(403, "You can only edit roles ranked below your own.");

  const next = {
    name: input.name === undefined ? role.name : cleanName(input.name),
    description: input.description === undefined ? role.description : String(input.description || "").trim().slice(0, 200),
    permissions: input.permissions === undefined ? role.permissions : cleanPermissions(actor, input.permissions),
    rank: input.rank === undefined ? role.rank : cleanRank(actor, input.rank),
  };

  await db.query(
    `UPDATE admin_roles SET name = $2, description = $3, permissions = $4::jsonb, rank = $5 WHERE key = $1`,
    [key, next.name, next.description, JSON.stringify(next.permissions), next.rank]
  );
  clearCache();
  return getRole(key);
};

const deleteRole = async (actor, key) => {
  const role = await getRole(key);
  if (!role) throw new HttpError(404, "Role not found.");
  if (role.isSystem) throw new HttpError(400, "Built-in roles cannot be deleted. Edit their permissions instead.");
  if (!isOwner(actor) && role.rank >= actor.rank) throw new HttpError(403, "You can only delete roles ranked below your own.");
  if (role.memberCount > 0) throw new HttpError(409, "Move the admins using this role to another role first.");
  await db.query("DELETE FROM admin_roles WHERE key = $1", [key]);
  clearCache();
};

module.exports = {
  assertCanManage,
  canAssignRole,
  clearCache,
  createRole,
  deleteRole,
  describeAccess,
  getRole,
  hasPermission,
  isOwner,
  listRoles,
  updateRole,
};
