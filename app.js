const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const { pool } = require('./db');

const app = express();

// ================= CONFIG =================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (manifest, service-worker, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Legacy redirect for cached PWA versions looking for /public/images
app.get('/public/images/:file', (req, res) => {
    res.redirect('/images/' + req.params.file);
});

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'fir_secret',
    resave: false,
    saveUninitialized: true
}));

// ================= STATIONS =================
// Station names MUST exactly match what is stored in the DB (from data.csv)
const stations = [
    "Betageri Extention PS",
    "Betageri PS",
    "Gadag CEN Crime PS",
    "Gadag Rural PS",
    "Gadag Town PS",
    "Gadag Traffic PS",
    "Gadag Women PS",
    "Gajendragad PS",
    "Lakshmeshwar PS",
    "Mulagund PS",
    "Mundargi PS",
    "Naregal PS",
    "Nargund PS",
    "Ron PS",
    "Shirahatti PS"
];

// ================= LOGIN PAGE =================
app.get('/', (req, res) => {

    res.render('login', {
        error: null,
        users: [
            { username: "DCRB DPO Gadag" },
            { username: "PS User" }
        ]
    });

});

// ================= LOGIN =================
app.post('/login', async (req, res) => {

    const { username, password } = req.body;

    try {

        const result = await pool.query(
            `SELECT * FROM users WHERE username = $1 AND password = $2`,
            [username, password]
        );

        // INVALID LOGIN
        if (result.rows.length === 0) {

            return res.render('login', {
                error: "Invalid credentials",
                users: [
                    { username: "DCRB DPO Gadag" },
                    { username: "PS User" }
                ]
            });

        }

        const user = result.rows[0];

        // ROLE-BASED REDIRECTION
        if (user.role === 'admin') {
            // admin user
            req.session.user = user;
            return res.redirect('/admin');
        } else if (user.role === 'subuser') {
            // PS user
            req.session.user = user;
            return res.redirect('/admin/report');
        } else {
            return res.render('login', {
                error: "Access denied",
                users: [
                    { username: "DCRB DPO Gadag" },
                    { username: "PS User" }
                ]
            });
        }

    } catch (err) {

        console.log(err);
        res.send("Database Error");

    }

});

// ================= AUTH =================
function isAuth(req, res, next) {

    if (!req.session.user) {
        return res.redirect('/');
    }

    next();

}

// ================= ADMIN PAGE =================
app.get('/admin', isAuth, (req, res) => {

    // ADMIN PAGE - only admin users can access this page
    if (req.session.user.role !== "admin") {
        // PS users are redirected to report page
        return res.redirect('/admin/report');
    }
    res.render('admin', {
        user: req.session.user,
        stations
    });

});

// ================= ADD FIR =================
app.post('/admin/add', isAuth, async (req, res) => {

    // ADD FIR - only admin users can add FIRs
    if (req.session.user.role !== "admin") {
        return res.redirect('/admin/report');
    }
    const {
        ps_name,
        fir_number,
        date,
        crime_type,
        is_pocso_scst
    } = req.body;
    
    const pocso = is_pocso_scst === 'on';

    // VALIDATION
    if (
        !ps_name ||
        !fir_number ||
        !date ||
        !crime_type
    ) {

        return res.send("All fields are required");

    }

    try {

        await pool.query(
            `INSERT INTO fir_records
            (police_station, fir_number, fir_date, crime_type, chargesheet_filed, is_pocso_scst)
            VALUES ($1, $2, $3, $4, false, $5)`,
            [ps_name, fir_number, date, crime_type, pocso]
        );

        res.redirect('/admin');

    } catch (err) {

        console.log("INSERT ERROR:", err);

        res.send(err.message);

    }

});

// ================= REPORT PAGE =================
app.get('/admin/report', isAuth, async (req, res) => {

    const { reportType, station, statusFilter } = req.query;

    try {

        // GET ALL FIR RECORDS — no pre-filtering, show everything by default
        const result = await pool.query(`
            SELECT * FROM fir_records
            ORDER BY fir_date DESC
        `);

        let data = result.rows;
        const totalInDB = data.length;

        // ================= STATION FILTER =================
        if (station && station !== "") {
            data = data.filter(fir => fir.police_station === station);
        }

        // ================= REPORT TYPE FILTER =================
        if (reportType && reportType !== "" && reportType !== "All") {

            const today = new Date();

            if (reportType === "All-Heinous") {
                // Show ALL Heinous regardless of age
                data = data.filter(fir => fir.crime_type === "Heinous");

            } else if (reportType === "All-Non-Heinous") {
                // Show ALL Non-Heinous regardless of age
                data = data.filter(fir => fir.crime_type === "Non-Heinous");

            } else {
                // Overdue filter — hide chargesheet filed, apply day threshold
                data = data.filter(fir => {

                    if (fir.chargesheet_filed === true || fir.chargesheet_filed === 1) return false;
                    if (fir.crime_type !== reportType) return false;

                    const firDate = new Date(fir.fir_date);
                    const diffDays = Math.floor((today - firDate) / (1000 * 60 * 60 * 24));

                    // Show all Heinous and Non-Heinous records regardless of age
                    if (reportType === "Heinous" && diffDays >= 0) return true;
                    if (reportType === "Non-Heinous" && diffDays >= 0) return true;

                    return false;
                });
            }
        }

        // ================= STATUS FILTER =================
        if (statusFilter && statusFilter !== "") {
            const today = new Date();
            data = data.filter(fir => {
                const firDate = new Date(fir.fir_date);
                const diffDays = Math.floor((today - firDate) / (1000 * 60 * 60 * 24));
                const limitDays = fir.is_pocso_scst ? 60 : (fir.crime_type === 'Heinous' ? 90 : 60);
                const isOverdue = !fir.chargesheet_filed && diffDays > limitDays;
                const isPending = !fir.chargesheet_filed && diffDays <= limitDays;

                if (statusFilter === "Pending") {
                    return isPending;
                } else if (statusFilter === "Overdue") {
                    return isOverdue;
                } else if (statusFilter === "All Status") {
                    return isPending || isOverdue;
                }
                return true;
            });
        }

        // Natural sort by FIR number descending
        data.sort((a, b) => {
            const aVal = a.fir_number || "";
            const bVal = b.fir_number || "";
            return bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.render('report', {
            data,
            stations,
            reportType: reportType || "",
            station: station || "",
            statusFilter: statusFilter || "",
            totalInDB,
            user: req.session.user
        });

    } catch (err) {
        console.log(err);
        res.send(err.message);
    }

});

// ================= UPDATE CHARGESHEET =================
app.post('/update-chargesheet/:id', isAuth, async (req, res) => {

    try {

        // Only admins can update chargesheet status
        if (req.session.user.role !== "admin") {
            return res.status(403).send("Unauthorized: Only Admins can update chargesheet status");
        }

        await pool.query(
            `UPDATE fir_records SET chargesheet_filed = true WHERE id = $1`,
            [req.params.id]
        );

        res.redirect('/admin/report');

    } catch (err) {

        console.log(err);

        res.send(err.message);

    }

});


// ================= UPDATE REASON =================
app.post('/update-reason/:id', isAuth, async (req, res) => {
    try {
        let { reason_for_pending, reason_for_pending_others } = req.body;
        if (reason_for_pending === 'Others') {
            reason_for_pending = reason_for_pending_others;
        }
        // Max 25 chars
        const safeReason = reason_for_pending ? reason_for_pending.substring(0, 25) : null;
        
        await pool.query(
            `UPDATE fir_records SET reason_for_pending = $1 WHERE id = $2`,
            [safeReason, req.params.id]
        );

        res.redirect('/admin/report');
    } catch (err) {
        console.log(err);
        res.send(err.message);
    }
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {

    req.session.destroy(() => {

        res.redirect('/');

    });

});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {

    console.log(
        `🚓 FIR System running → http://localhost:${PORT}`
    );

});