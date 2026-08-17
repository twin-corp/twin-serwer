const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                data JSONB DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                sender TEXT NOT NULL,
                receiver TEXT NOT NULL,
                text TEXT,
                photo TEXT,
                type TEXT DEFAULT 'text',
                time TEXT,
                read BOOLEAN DEFAULT false,
                reactions JSONB DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS ads (
                id TEXT PRIMARY KEY,
                author TEXT NOT NULL,
                title TEXT,
                price TEXT,
                desc TEXT,
                photos JSONB DEFAULT '[]',
                created BIGINT
            );
            CREATE TABLE IF NOT EXISTS blocked (
                username TEXT,
                blocked_user TEXT,
                PRIMARY KEY (username, blocked_user)
            );
            CREATE TABLE IF NOT EXISTS last_seen (
                username TEXT PRIMARY KEY,
                time BIGINT
            );
        `);
        console.log('✅ Таблицы созданы');
    } catch (e) {
        console.error('❌ Ошибка:', e.message);
    }
}
initDB();

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Пользователь уже существует' });
        await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (user.rows.length === 0) return res.status(401).json({ error: 'Неверный логин или пароль' });
        res.json({ success: true, user: user.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages', async (req, res) => {
    const { id, sender, receiver, text, photo, type, time, read, reactions } = req.body;
    try {
        await pool.query(
            'INSERT INTO messages (id, sender, receiver, text, photo, type, time, read, reactions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [id, sender, receiver, text, photo, type, time, read, reactions || '{}']
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
    const { user1, user2 } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM messages WHERE (sender = $1 AND receiver = $2) OR (sender = $2 AND receiver = $1) ORDER BY id`,
            [user1, user2]
        );
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, data FROM users');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/update-user', async (req, res) => {
    const { username, data } = req.body;
    try {
        await pool.query('UPDATE users SET data = $1 WHERE username = $2', [data, username]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ads', async (req, res) => {
    const { id, author, title, price, desc, photos, created } = req.body;
    try {
        await pool.query(
            'INSERT INTO ads (id, author, title, price, desc, photos, created) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [id, author, title, price, desc, photos || [], created]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ads', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ads ORDER BY created DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM ads WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/block', async (req, res) => {
    const { username, blocked_user } = req.body;
    try {
        await pool.query('INSERT INTO blocked (username, blocked_user) VALUES ($1,$2) ON CONFLICT DO NOTHING', [username, blocked_user]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/block', async (req, res) => {
    const { username, blocked_user } = req.body;
    try {
        await pool.query('DELETE FROM blocked WHERE username = $1 AND blocked_user = $2', [username, blocked_user]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/blocked/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query('SELECT blocked_user FROM blocked WHERE username = $1', [username]);
        res.json(result.rows.map(r => r.blocked_user));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lastseen', async (req, res) => {
    const { username, time } = req.body;
    try {
        await pool.query('INSERT INTO last_seen (username, time) VALUES ($1,$2) ON CONFLICT (username) DO UPDATE SET time = $2', [username, time]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/lastseen/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query('SELECT time FROM last_seen WHERE username = $1', [username]);
        res.json({ time: result.rows[0]?.time || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
