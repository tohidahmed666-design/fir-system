const { pool } = require('../db');

async function ensureUser() {
    try {
        await pool.query(`
            INSERT INTO users (username, password, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (username) 
            DO UPDATE SET password = $2, role = $3
        `, ['PS User', 'ksp@123ABC', 'subuser']);
        console.log('PS User ensured');
    } catch (err) {
        console.error('Error ensuring user:', err);
    } finally {
        process.exit();
    }
}

ensureUser();
