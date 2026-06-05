require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const FIRST_ADMIN_EMAIL = 'harikrishnahk060@gmail.com';
const BOOTSTRAP_FLAG_KEY = 'admin_bootstrap_done';

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
    `CREATE TABLE IF NOT EXISTS system_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  );

  await pool.query(
    `INSERT INTO system_flags (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [BOOTSTRAP_FLAG_KEY, 'false']
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

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`);

  await pool.query(
    `CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      reported_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      reported_email TEXT,
      message TEXT NOT NULL,
      assigned_to INTEGER NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
}


initializeDatabase().catch((error) => {
  console.error('Failed to initialize database:', error.message);
  process.exit(1);
});

app.use(express.json());

async function getSystemFlag(key) {
  const result = await pool.query('SELECT value FROM system_flags WHERE key = $1', [key]);
  return result.rowCount > 0 ? result.rows[0].value : null;
}

async function setSystemFlag(key, value) {
  await pool.query(
    `INSERT INTO system_flags (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function anyAdminExists() {
  const result = await pool.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  return result.rowCount > 0;
}

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
    const normalizedEmail = email.trim().toLowerCase();
    const bootstrapDone = (await getSystemFlag(BOOTSTRAP_FLAG_KEY)) === 'true';
    let role = 'user';

    if (normalizedEmail === FIRST_ADMIN_EMAIL && !bootstrapDone && !(await anyAdminExists())) {
      role = 'admin';
    }

    // Prevent duplicate signup
    const exists = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalizedEmail]);
    if (exists.rowCount > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id';
    await pool.query(query, [name, normalizedEmail, hashedPassword, role]);

    if (role === 'admin') {
      await setSystemFlag(BOOTSTRAP_FLAG_KEY, 'true');
    }

    res.json({ message: 'Account created successfully!' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already registered.' });
    }
    console.error('Database insert error:', err.message);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/bootstrap-admin', async (req, res) => {
  try {
    const bootstrapDone = (await getSystemFlag(BOOTSTRAP_FLAG_KEY)) === 'true';
    if (bootstrapDone || (await anyAdminExists())) {
      await setSystemFlag(BOOTSTRAP_FLAG_KEY, 'true');
      return res.status(403).json({ error: 'Admin bootstrap is no longer available.' });
    }

    const normalizedEmail = FIRST_ADMIN_EMAIL;
    const userResult = await pool.query('SELECT id, role FROM users WHERE LOWER(email) = $1', [normalizedEmail]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: `No account found for ${normalizedEmail}. Please sign up with that email first.` });
    }

    const user = userResult.rows[0];
    if (user.role === 'admin') {
      await setSystemFlag(BOOTSTRAP_FLAG_KEY, 'true');
      return res.json({ message: 'Admin account is already active.' });
    }

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
    await setSystemFlag(BOOTSTRAP_FLAG_KEY, 'true');

    res.json({ message: 'Admin bootstrap completed. The first admin account is now active.' });
  } catch (err) {
    console.error('Bootstrap admin error:', err.message);
    res.status(500).json({ error: 'Could not complete admin bootstrap.' });
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
    // Check ban
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ error: 'Account banned until ' + new Date(user.banned_until).toISOString() + (user.ban_reason ? ('. Reason: ' + user.ban_reason) : '') });
    }
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
    const onlyRegistered = req.query.onlyRegistered === 'true';
    let q = 'SELECT id, name, email, role, created_at, banned_until FROM users';
    const params = [];
    if (onlyRegistered) {
      q += " WHERE role = 'user'";
    }
    q += ' ORDER BY created_at DESC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('User lookup error:', err.message);
    res.status(500).json({ error: 'Unable to retrieve users.' });
  }
});

// Move a registered user into the City Patrol members list (admin only)
app.post('/api/users/:id/move-to-patrol', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT id, name, email FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];
    const email = user.email.trim().toLowerCase();

    const dup = await client.query('SELECT 1 FROM city_patrol WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (dup.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A City Patrol member with that email already exists.' });
    }

    await client.query('INSERT INTO city_patrol (name, email, message) VALUES ($1, $2, $3)', [user.name, email, 'Moved to City Patrol by admin']);
    // Keep the user account but mark as patrol so they no longer appear in Registered Users list
    await client.query("UPDATE users SET role = 'patrol' WHERE id = $1", [userId]);

    await client.query('COMMIT');
    res.json({ message: 'User moved to City Patrol.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Move to patrol error:', err.message);
    res.status(500).json({ error: 'Could not move user to patrol.' });
  } finally {
    client.release();
  }
});

// Delete a user (admin only)
app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User removed.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Could not remove user.' });
  }
});

// Delete a patrol member (admin only)
app.delete('/api/patrols/:id', requireAdmin, async (req, res) => {
  const patrolId = parseInt(req.params.id, 10);
  if (!patrolId || Number.isNaN(patrolId)) return res.status(400).json({ error: 'Invalid patrol id.' });
  try {
    await pool.query('DELETE FROM city_patrol WHERE id = $1', [patrolId]);
    res.json({ message: 'Patrol member removed.' });
  } catch (err) {
    console.error('Delete patrol error:', err.message);
    res.status(500).json({ error: 'Could not remove patrol member.' });
  }
});

// Ban a user for a given duration (minutes). 0 = permanent.
app.post('/api/users/:id/ban', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { minutes, reason } = req.body;
  if (!userId || Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    let bannedUntil = null;
    if (typeof minutes === 'number' && minutes > 0) {
      bannedUntil = new Date(Date.now() + minutes * 60000).toISOString();
    } else if (minutes === 0) {
      // permanent ban
      bannedUntil = new Date('2999-12-31T23:59:59Z').toISOString();
    }
    await pool.query('UPDATE users SET banned_until = $1, ban_reason = $2 WHERE id = $3', [bannedUntil, reason || null, userId]);
    res.json({ message: 'User banned.' });
  } catch (err) {
    console.error('Ban user error:', err.message);
    res.status(500).json({ error: 'Could not ban user.' });
  }
});

app.post('/api/users/:id/unban', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    await pool.query('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1', [userId]);
    res.json({ message: 'User unbanned.' });
  } catch (err) {
    console.error('Unban user error:', err.message);
    res.status(500).json({ error: 'Could not unban user.' });
  }
});

// Reports endpoints
app.post('/api/reports', async (req, res) => {
  const { reported_user_id, reported_email, message } = req.body;
  let reporterId = null;
  try {
    const authUser = await authenticateToken(req);
    if (authUser) reporterId = authUser.id;
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    await pool.query('INSERT INTO reports (reporter_id, reported_user_id, reported_email, message) VALUES ($1, $2, $3, $4)', [reporterId, reported_user_id || null, reported_email || null, message]);
    res.json({ message: 'Report submitted.' });
  } catch (err) {
    console.error('Create report error:', err.message);
    res.status(500).json({ error: 'Could not submit report.' });
  }
});

// Get reports: admins see all, patrol members see reports assigned to them or unassigned
app.get('/api/reports', async (req, res) => {
  try {
    const authUser = await authenticateToken(req);
    if (!authUser) return res.status(403).json({ error: 'Auth required.' });
    if (authUser.role === 'admin') {
      const result = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    if (authUser.role === 'patrol') {
      const result = await pool.query('SELECT * FROM reports WHERE assigned_to IS NULL OR assigned_to = $1 ORDER BY created_at DESC', [authUser.id]);
      return res.json(result.rows);
    }
    return res.status(403).json({ error: 'Access denied.' });
  } catch (err) {
    console.error('Get reports error:', err.message);
    res.status(500).json({ error: 'Could not retrieve reports.' });
  }
});

app.post('/api/reports/:id/assign', requireAdmin, async (req, res) => {
  const reportId = parseInt(req.params.id, 10);
  const { patrolUserId } = req.body;
  if (!reportId || Number.isNaN(reportId)) return res.status(400).json({ error: 'Invalid report id.' });
  try {
    await pool.query('UPDATE reports SET assigned_to = $1 WHERE id = $2', [patrolUserId || null, reportId]);
    res.json({ message: 'Report assigned.' });
  } catch (err) {
    console.error('Assign report error:', err.message);
    res.status(500).json({ error: 'Could not assign report.' });
  }
});

// Search endpoint for admin: search users and patrols
app.get('/api/search', requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    if (!q) {
      const users = (await pool.query("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200")).rows;
      const patrols = (await pool.query('SELECT id, name, email, message, joined_at FROM city_patrol ORDER BY joined_at DESC LIMIT 200')).rows;
      return res.json({ users, patrols });
    }
    const like = '%' + q + '%';
    const users = (await pool.query("SELECT id, name, email, role, created_at FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 200", [like])).rows;
    const patrols = (await pool.query('SELECT id, name, email, message, joined_at FROM city_patrol WHERE name ILIKE $1 OR email ILIKE $1 OR message ILIKE $1 ORDER BY joined_at DESC LIMIT 200', [like])).rows;
    res.json({ users, patrols });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed.' });
  }
});

app.post('/api/join', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const dup = await pool.query('SELECT 1 FROM city_patrol WHERE LOWER(email) = $1 LIMIT 1', [normalizedEmail]);
    if (dup.rowCount > 0) {
      return res.status(400).json({ error: 'A City Patrol member with that email already exists.' });
    }

    await pool.query('INSERT INTO city_patrol (name, email, message) VALUES ($1, $2, $3)', [name, normalizedEmail, message]);
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
