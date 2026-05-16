const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

// ---------------------------------------------------------------------------
// Minimal CSV parser – handles quoted fields & \r\n / \n line endings
// ---------------------------------------------------------------------------
function parseCSV(raw) {
    const rows = [];
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;
        const fields = [];
        let cur = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                fields.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        fields.push(cur.trim());
        rows.push(fields);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Date helper: parses M/D/YY or M/D/YYYY → YYYY-MM-DD
// ---------------------------------------------------------------------------
function parseDate(raw) {
    const parts = raw.split('/');
    if (parts.length !== 3) return null;
    const [m, d, y] = parts.map(s => s.trim());
    const year = y.length <= 2 ? '20' + y.padStart(2, '0') : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------
async function importData() {
    const csvPath = path.join(__dirname, 'data.csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`❌  data.csv not found at: ${csvPath}`);
        process.exit(1);
    }

    const raw  = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(raw);

    // First row is the header
    const header  = rows[0];
    const records = rows.slice(1);

    console.log('='.repeat(60));
    console.log('  FIR Data Import Tool');
    console.log('='.repeat(60));
    console.log(`  CSV path  : ${csvPath}`);
    console.log(`  Header    : ${header.join(' | ')}`);
    console.log(`  Data rows : ${records.length}`);
    console.log('='.repeat(60));

    // ── Step 1: Truncate existing data ──────────────────────────────────────
    try {
        console.log('\n[1/3] Clearing existing fir_records …');
        await pool.query('TRUNCATE TABLE fir_records RESTART IDENTITY CASCADE');
        console.log('      ✅  Table cleared.\n');
    } catch (err) {
        console.error('      ❌  Failed to truncate table:', err.message);
        process.exit(1);
    }

    // ── Step 2: Parse & validate rows ──────────────────────────────────────
    console.log('[2/3] Parsing rows …');

    const valid   = [];
    const skipped = [];

    for (let i = 0; i < records.length; i++) {
        const parts = records[i];
        const lineNo = i + 2; // +1 for header, +1 for 1-based

        if (parts.length < 5) {
            skipped.push({ lineNo, reason: `Only ${parts.length} column(s)`, raw: records[i].join(',') });
            continue;
        }

        const psName   = parts[0];
        const firNo    = parts[1];
        const firDate  = parts[2];
        // parts[3] = Year column (not stored separately)
        let   caseType = parts[4];

        if (!psName || !firNo || !firDate) {
            skipped.push({ lineNo, reason: 'Missing required field', raw: records[i].join(',') });
            continue;
        }

        // Normalise crime type
        if (caseType === 'Non Heinous')  caseType = 'Non-Heinous';
        if (caseType === 'non heinous')  caseType = 'Non-Heinous';
        if (caseType === 'heinous')      caseType = 'Heinous';

        const formattedDate = parseDate(firDate);
        if (!formattedDate) {
            skipped.push({ lineNo, reason: `Bad date: "${firDate}"`, raw: records[i].join(',') });
            continue;
        }

        valid.push({ psName, firNo, formattedDate, caseType });
    }

    console.log(`      ✅  Valid rows   : ${valid.length}`);
    if (skipped.length > 0) {
        console.log(`      ⚠️   Skipped rows : ${skipped.length}`);
        skipped.forEach(s => console.log(`           Line ${s.lineNo}: ${s.reason}  →  "${s.raw}"`));
    }

    // ── Step 3: Bulk insert ─────────────────────────────────────────────────
    console.log('\n[3/3] Inserting records …');

    let inserted = 0;
    let failed   = 0;

    // Process in batches of 50 for reliability
    const BATCH = 50;
    for (let start = 0; start < valid.length; start += BATCH) {
        const batch = valid.slice(start, start + BATCH);

        // Build a single multi-row INSERT for the batch
        const valuePlaceholders = [];
        const flatValues = [];

        batch.forEach((row, idx) => {
            const base = idx * 4;
            valuePlaceholders.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, false)`);
            flatValues.push(row.psName, row.firNo, row.formattedDate, row.caseType);
        });

        const sql = `
            INSERT INTO fir_records (police_station, fir_number, fir_date, crime_type, chargesheet_filed)
            VALUES ${valuePlaceholders.join(', ')}
        `;

        try {
            await pool.query(sql, flatValues);
            inserted += batch.length;
            console.log(`      Inserted ${inserted} / ${valid.length} …`);
        } catch (batchErr) {
            // Batch failed – fall back to row-by-row so we maximise inserts
            console.warn(`      ⚠️  Batch ${start}–${start + batch.length - 1} failed (${batchErr.message}), retrying row-by-row …`);
            for (const row of batch) {
                try {
                    await pool.query(
                        `INSERT INTO fir_records (police_station, fir_number, fir_date, crime_type, chargesheet_filed)
                         VALUES ($1, $2, $3, $4, false)`,
                        [row.psName, row.firNo, row.formattedDate, row.caseType]
                    );
                    inserted++;
                } catch (rowErr) {
                    failed++;
                    console.error(`      ❌  Row failed [${row.psName} / FIR ${row.firNo}]: ${rowErr.message}`);
                }
            }
        }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('  IMPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Total CSV rows   : ${records.length}`);
    console.log(`  Parsed valid     : ${valid.length}`);
    console.log(`  ✅  Inserted      : ${inserted}`);
    console.log(`  ⚠️   CSV skipped   : ${skipped.length}`);
    console.log(`  ❌  DB failed     : ${failed}`);
    console.log('='.repeat(60));

    // Verify in DB
    try {
        const res = await pool.query('SELECT COUNT(*) FROM fir_records');
        console.log(`\n  DB row count now : ${res.rows[0].count}`);
    } catch (e) {
        console.warn('  Could not verify DB count:', e.message);
    }

    process.exit(failed > 0 ? 1 : 0);
}

importData();
