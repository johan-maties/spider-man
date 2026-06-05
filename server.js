require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable. Set DATABASE_URL to connect to PostgreSQL.');
  process.exit(1);
}

const useSsl = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
  process.exit(1);
});

async function initializeDatabase() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);

  await pool.query(
    `CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS city_patrol (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      joined_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
}

initializeDatabase().catch((error) => {
  console.error('Failed to initialize database:', error.message);
  process.exit(1);
});

app.use(express.json());

async function authenticateToken(req) {
  const authHeader = req.headers.authorization || '';
  const tokenParam = req.query.token;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : tokenParam;

  if (!token) {
    return null;
  }

  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role
     FROM auth_tokens t
     JOIN users u ON t.user_id = u.id
     WHERE t.token = $1`,
    [token]
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function requireAdmin(req, res, next) {
  try {
    const user = await authenticateToken(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error.message);
    res.status(500).json({ error: 'Server error.' });
  }
}

app.get('/admin.html', async (req, res) => {
  try {
    const user = await authenticateToken(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).send('Access denied. Admin access required.');
    }
    res.sendFile(path.join(__dirname, 'admin.html'));
  } catch (error) {
    console.error('Admin route error:', error.message);
    res.status(500).send('Server error.');
  }
});

app.use(express.static(path.join(__dirname)));

// Sign up endpoint
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id';
    await pool.query(query, [name, email, hashedPassword]);
    res.json({ message: 'Account created successfully!' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already registered.' });
    }
    console.error('Database insert error:', err.message);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT id, name, email, password, role FROM users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO auth_tokens (token, user_id) VALUES ($1, $2)', [token, user.id]);

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get all users (admin only)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('User lookup error:', err.message);
    res.status(500).json({ error: 'Unable to retrieve users.' });
  }
});

app.post('/api/join', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  try {
    await pool.query('INSERT INTO city_patrol (name, email, message) VALUES ($1, $2, $3)', [name, email, message]);
    res.json({ message: 'Welcome to the City Patrol, hero!' });
  } catch (err) {
    console.error('Database insert error:', err.message);
    res.status(500).json({ error: 'Could not save your entry. Please try again.' });
  }
});

app.get('/api/patrols', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, message, joined_at FROM city_patrol ORDER BY joined_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Patrol lookup error:', err.message);
    res.status(500).json({ error: 'Unable to retrieve patrol records.' });
  }
});

app.listen(PORT, () => {
  console.log(`Spider-Man site running at http://localhost:${PORT}`);
});
