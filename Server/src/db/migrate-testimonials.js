const db = require("./postgres");

const migrateTestimonials = async () => {
  await db.withTransaction(async (client) => {
    await client.query("ALTER TABLE testimonials ALTER COLUMN video_url DROP NOT NULL");
    await client.query(
      "ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS review_type TEXT NOT NULL DEFAULT 'video'"
    );
    await client.query("UPDATE testimonials SET review_type = CASE WHEN video_url IS NULL THEN 'written' ELSE 'video' END");
    await client.query("ALTER TABLE testimonials DROP CONSTRAINT IF EXISTS testimonials_review_type_check");
    await client.query(
      "ALTER TABLE testimonials ADD CONSTRAINT testimonials_review_type_check CHECK (review_type IN ('video', 'written'))"
    );
  });

  const result = await db.query(
    "SELECT review_type, COUNT(*)::int AS count FROM testimonials GROUP BY review_type ORDER BY review_type"
  );
  console.log(JSON.stringify({ testimonials: result.rows }, null, 2));
  await db.pool.end();
};

migrateTestimonials().catch(async (error) => {
  console.error(error);
  await db.pool.end();
  process.exit(1);
});
