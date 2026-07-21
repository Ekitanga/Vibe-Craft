const db = require("../db/postgres");

const mapCategoryRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
});

const listCategories = async () => {
  const result = await db.query(
    `SELECT id, name, description
     FROM categories
     ORDER BY name ASC`
  );

  return result.rows.map(mapCategoryRow);
};

const findCategoryById = async (id) => {
  const result = await db.query(
    `SELECT id, name, description
     FROM categories
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? mapCategoryRow(result.rows[0]) : undefined;
};

module.exports = {
  listCategories,
  findCategoryById,
};
