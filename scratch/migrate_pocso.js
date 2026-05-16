const { pool } = require('../db');

async function migrate() {
    try {
        await pool.query(`ALTER TABLE fir_records ADD COLUMN IF NOT EXISTS is_pocso_scst BOOLEAN DEFAULT false`);
        console.log("Migration successful: added is_pocso_scst column.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

migrate();
