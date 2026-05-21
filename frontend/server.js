const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

const dbConfig = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "studio_velvet",
  password: process.env.DB_PASS || "klarity69",
  port: process.env.DB_PORT || 5432
};

const pool = new Pool(dbConfig);

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const actualTime = timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
    const parts = actualTime.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
}

/* 1. Endpoint pro načtení kadeřníků */ 
app.get('/api/stylists', async (req, res) => {
    try {
        const result = await pool.query("SELECT stylista_id, jmeno, prijmeni FROM stylisti ORDER BY jmeno");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání kadeřníků" });
    }
});

/* 2. Endpoint pro načtení služeb */
app.get('/api/styles', async (req, res) => {
    try {
        const result = await pool.query("SELECT styl_id, nazev, popis, cena, delka_trvani FROM styly ORDER BY nazev");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při načítání stylů" });
    }
});

/* 3. Endpoint administrace - Vyhledání rezervací (OPRAVENO: Spojení s tabulkou klienti) */
app.post('/api/admin/bookings', async (req, res) => {
    try {
        const { stylistId, date } = req.body;
        if (!date) return res.status(400).json({ error: "Chybí datum." });

       
        let queryText = `
            SELECT r.rezervace_id, 
                   to_char(r.zacatek, 'YYYY-MM-DD HH24:MI:SS') as zacatek, 
                   to_char(r.konec, 'YYYY-MM-DD HH24:MI:SS') as konec, 
                   r.status,
                   k.jmeno || ' ' || k.prijmeni as klient_jmeno, 
                   k.email as klient_email,
                   s.jmeno || ' ' || s.prijmeni as kadernek_jmeno
            FROM rezervace r
            JOIN stylisti s ON r.stylista_stylista_id = s.stylista_id
            JOIN klienti k ON r.klient_klient_id = k.klient_id
            WHERE r.datum = $1
        `;
        
        let params = [date];


        if (stylistId && stylistId !== 'ALL') {
            queryText += ` AND r.stylista_stylista_id = $2`;
            params.push(stylistId);
        }

        queryText += ` ORDER BY r.zacatek ASC`;

        const result = await pool.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error("CRITICAL ADMIN ERROR:", err.message);
        res.status(500).json({ error: "Chyba administrace: " + err.message });
    }
});

/* 4. Endpoint administrace - Změna stavu rezervace (Splňuje IO3) */
app.post('/api/admin/reservations/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const povoleneStavy = ['Čeká', 'Potvrzeno', 'Zrušeno', 'Dokončeno'];
        if (!povoleneStavy.includes(status)) {
            return res.status(400).json({ error: "Nepovolený stav rezervace." });
        }

        await pool.query('UPDATE rezervace SET status = $1 WHERE rezervace_id = $2', [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba při aktualizaci stavu rezervace" });
    }
});

/* 5. Endpoint administrace - Online úprava Lookbooku */
app.put('/api/admin/styles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nazev, popis, cena, delka } = req.body;
        await pool.query(
            "UPDATE styly SET nazev=$1, popis=$2, cena=$3, delka_trvani=$4 WHERE styl_id=$5",
            [nazev, popis, cena, delka, id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba úpravy služby" });
    }
});

/* 6. Endpoint administrace - Tlačítko Zrušit */
app.put('/api/admin/bookings/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE rezervace SET status = 'Zrušeno' WHERE rezervace_id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba stornování" });
    }
});

/* 7. Endpoint pro zjištění dostupnosti (Rezervační formulář) */
app.post('/api/check-availability', async (req, res) => {
    try {
        const { stylistId, date, selectedStyles } = req.body;
        if (!stylistId || !date || !selectedStyles || selectedStyles.length === 0) {
            return res.status(400).json({ error: "Chybí parametry." });
        }

        const stylesResult = await pool.query("SELECT delka_trvani FROM styly WHERE styl_id = ANY($1)", [selectedStyles]);
        let celkovaDelka = 0;
        stylesResult.rows.forEach(r => celkovaDelka += r.delka_trvani);

        const dbDate = new Date(date);
        const dayOfWeek = dbDate.getDay();
        
        let denNazev = '';
        if (dayOfWeek === 1) denNazev = 'Pondělí';
        else if (dayOfWeek === 2) denNazev = 'Úterý';
        else if (dayOfWeek === 3) denNazev = 'Středa';
        else if (dayOfWeek === 4) denNazev = 'Čtvrtek';
        else if (dayOfWeek === 5) denNazev = 'Pátek';
        else if (dayOfWeek === 6) denNazev = 'Sobota';
        else if (dayOfWeek === 0) denNazev = 'Neděle';

        let limitOd = 0, limitDo = 0;
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            limitOd = 9 * 60; limitDo = 19 * 60;
        } else if (dayOfWeek === 6) {
            limitOd = 10 * 60; limitDo = 14 * 60;
        } else {
            return res.json({ dostupneSloty: [] });
        }

        const rozvrhResult = await pool.query(
            "SELECT to_char(cas_od, 'HH24:MI') as cas_od, to_char(cas_do, 'HH24:MI') as cas_do FROM pracovni_doba WHERE stylista_stylista_id = $1 AND den_v_tydnu = $2",
            [stylistId, denNazev]
        );

        if (rozvrhResult.rows.length === 0) {
            return res.json({ dostupneSloty: [] });
        }

        const vyjimkaResult = await pool.query(
            "SELECT to_char(cas_od, 'HH24:MI') as cas_od, to_char(cas_do, 'HH24:MI') as cas_do FROM vyjimky_v_rozvrhu WHERE stylista_stylista_id = $1 AND datum = $2",
            [stylistId, date]
        );

        const rezervaceResult = await pool.query(
            `SELECT to_char(zacatek, 'HH24:MI') as cas_od, to_char(konec, 'HH24:MI') as cas_do FROM rezervace 
             WHERE stylista_stylista_id = $1 AND datum = $2 AND status != 'Zrušeno'`,
            [stylistId, date]
        );

        let obsazeneIntervaly = [];
        rezervaceResult.rows.forEach(r => {
            if (r.cas_od && r.cas_do) obsazeneIntervaly.push({ od: timeToMinutes(r.cas_od), do: timeToMinutes(r.cas_do) });
        });
        vyjimkaResult.rows.forEach(v => {
            if (v.cas_od && v.cas_do) obsazeneIntervaly.push({ od: timeToMinutes(v.cas_od), do: timeToMinutes(v.cas_do) });
        });

        let dostupneSloty = [];
        const krokSlotu = 30;

        rozvrhResult.rows.forEach(smena => {
            const pracOd = timeToMinutes(smena.cas_od);
            const pracDo = timeToMinutes(smena.cas_do);

            for (let cas = pracOd; cas <= pracDo - celkovaDelka; cas += krokSlotu) {
                let slotZacatek = cas;
                let slotKonec = cas + celkovaDelka;

                if (slotZacatek < limitOd || slotKonec > limitDo) continue;

                let jeVolno = true;
                for (let i = 0; i < obsazeneIntervaly.length; i++) {
                    let obsazeno = obsazeneIntervaly[i];
                    if (!(slotKonec <= obsazeno.od || slotZacatek >= obsazeno.do)) {
                        jeVolno = false;
                        break;
                    }
                }

                if (jeVolno) {
                    const h = String(Math.floor(slotZacatek / 60)).padStart(2, '0');
                    const m = String(slotZacatek % 60).padStart(2, '0');
                    const novySlot = `${h}:${m}`;
                    if (!dostupneSloty.includes(novySlot)) dostupneSloty.push(novySlot);
                }
            }
        });

        dostupneSloty.sort();
        res.json({ dostupneSloty });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Chyba výpočtu dostupnosti" });
    }
});

/* SPUŠTĚNÍ SERVERU */
app.listen(3000, () => {
    console.log("Backend server Studia Velvet úspěšně běží na http://localhost:3000");
});