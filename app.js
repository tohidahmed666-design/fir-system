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

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'fir_secret',
    resave: false,
    saveUninitialized: true
}));

// ================= STATIONS =================
const stations = [
    "Gadag Town PS",
    "Gadag Traffic PS",
    "Betageri PS",
    "Betageri Extension PS",
    "Gadag Rural PS",
    "Gadag Women PS",
    "Gadag CEN PS",
    "Mulagund PS",
    "Ron PS",
    "Naregal PS",
    "Gajendragad PS",
    "Shirahatti PS",
    "Lakshmeshwar PS",
    "Nargund PS",
    "Mundargi PS"
];

// ================= LOGIN PAGE =================
app.get('/', (req, res) => {

    res.render('login', {
        error: null,
        users: [
            { username: "DCRB DPO Gadag" }
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
                    { username: "DCRB DPO Gadag" }
                ]
            });

        }

        const user = result.rows[0];

        // ADMIN ACCESS ONLY
        if (user.username !== "DCRB DPO Gadag") {

            return res.render('login', {
                error: "Access denied",
                users: [
                    { username: "DCRB DPO Gadag" }
                ]
            });

        }

        req.session.user = user;

        res.redirect('/admin');

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

    res.render('admin', {
        user: req.session.user,
        stations
    });

});

// ================= ADD FIR =================
app.post('/admin/add', isAuth, async (req, res) => {

    const {
        ps_name,
        fir_number,
        date,
        crime_type
    } = req.body;

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
            (police_station, fir_number, fir_date, crime_type, chargesheet_filed)
            VALUES ($1, $2, $3, $4, false)`,
            [ps_name, fir_number, date, crime_type]
        );

        res.redirect('/admin');

    } catch (err) {

        console.log("INSERT ERROR:", err);

        res.send(err.message);

    }

});

// ================= REPORT PAGE =================
app.get('/admin/report', isAuth, async (req, res) => {

    const { reportType, station } = req.query;

    try {

        // GET ALL FIR RECORDS
        const result = await pool.query(`
            SELECT * FROM fir_records
            ORDER BY fir_date DESC
        `);

        let data = result.rows;

        // ================= STATION FILTER =================
        if (station && station !== "") {

            data = data.filter(fir =>
                fir.police_station === station
            );

        }

        // ================= REPORT FILTER =================
        if (reportType && reportType !== "") {

            const today = new Date();

            data = data.filter(fir => {

                // HIDE CHARGESHEET FILED FIR
                if (
                    fir.chargesheet_filed === true ||
                    fir.chargesheet_filed === 1
                ) {
                    return false;
                }

                // CHECK CRIME TYPE
                if (fir.crime_type !== reportType) {
                    return false;
                }

                const firDate = new Date(fir.fir_date);

                const diffDays = Math.floor(
                    (today - firDate) /
                    (1000 * 60 * 60 * 24)
                );

                // HEINOUS CASES
                if (
                    reportType === "Heinous" &&
                    diffDays >= 80
                ) {
                    return true;
                }

                // NON-HEINOUS CASES
                if (
                    reportType === "Non-Heinous" &&
                    diffDays >= 50
                ) {
                    return true;
                }

                return false;

            });

        }

        // Natural sort for FIR numbers (e.g., 20/2024 before 2/2024) in descending order
        data.sort((a, b) => {
            const aVal = a.fir_number || "";
            const bVal = b.fir_number || "";
            return bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.render('report', {
            data,
            stations,
            reportType: reportType || "",
            station: station || ""
        });

    } catch (err) {

        console.log(err);

        res.send(err.message);

    }

});

// ================= UPDATE CHARGESHEET =================
app.post('/update-chargesheet/:id', isAuth, async (req, res) => {

    try {

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