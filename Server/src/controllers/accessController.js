// Roles & permissions (Admin → Access control).
const asyncHandler = require("../utils/asyncHandler");
const rbac = require("../services/rbacService");
const auditService = require("../services/auditService");

const listRoles = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await rbac.listRoles() });
});

const createRole = asyncHandler(async (req, res) => {
  const role = await rbac.createRole(req.admin, req.body || {});
  await auditService.record(req.admin, "create_role", "role", role.key, { name: role.name, permissions: role.permissions.length });
  res.status(201).json({ success: true, data: role });
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await rbac.updateRole(req.admin, req.params.key, req.body || {});
  await auditService.record(req.admin, "update_role", "role", role.key, { name: role.name, rank: role.rank, permissions: role.permissions.join(" ") });
  res.json({ success: true, data: role });
});

const deleteRole = asyncHandler(async (req, res) => {
  await rbac.deleteRole(req.admin, req.params.key);
  await auditService.record(req.admin, "delete_role", "role", req.params.key);
  res.status(204).send();
});

module.exports = { createRole, deleteRole, listRoles, updateRole };
