const { pool } = require('../db');

async function migrate() {
    try {
        await pool.query(`ALTER TABLE fir_records ADD COLUMN IF NOT EXISTS reason_for_pending VARCHAR(25)`);
        console.log("Migration successful: added reason_for_pending column.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

migrate();
