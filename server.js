const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'city-patrol.sqlite');

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('Failed to connect to SQLite database:', error.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS city_patrol (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

app.use(express.json());
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
    const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    
    db.run(query, [name, email, hashedPassword], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email already registered.' });
        }
        console.error('Database insert error:', err.message);
        return res.status(500).json({ error: 'Could not create account.' });
      }

      res.json({ message: 'Account created successfully!' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const query = 'SELECT id, name, email, password FROM users WHERE email = ?';
  
  db.get(query, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error.' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    try {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      res.json({ 
        message: 'Login successful!',
        token: 'token_' + user.id,
        user: { id: user.id, name: user.name, email: user.email }
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error.' });
    }
  });
});

// Get all users (admin only)
app.get('/api/users', (req, res) => {
  const adminPassword = req.query.key;
  
  if (!adminPassword || adminPassword !== 'spidersense') {
    return res.status(403).json({ error: 'Unauthorized access.' });
  }

  db.all('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to retrieve users.' });
    }
    res.json(rows);
  });
});

app.post('/api/join', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const query = 'INSERT INTO city_patrol (name, email, message) VALUES (?, ?, ?)';
  db.run(query, [name, email, message], function (err) {
    if (err) {
      console.error('Database insert error:', err.message);
      return res.status(500).json({ error: 'Could not save your entry. Please try again.' });
    }

    res.json({ message: 'Welcome to the City Patrol, hero!' });
  });
});

app.get('/api/patrols', (req, res) => {
  const adminPassword = req.query.key;
  
  if (!adminPassword || adminPassword !== 'spidersense') {
    return res.status(403).json({ error: 'Unauthorized access to patrol records.' });
  }

  db.all('SELECT id, name, email, message, joined_at FROM city_patrol ORDER BY joined_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to retrieve patrol records.' });
    }
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Spider-Man site running at http://localhost:${PORT}`);
});
