const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Setup page (only shown if no users exist)
router.get('/', async (req, res) => {
  try {
    const userCount = await req.db.get('SELECT COUNT(*) as count FROM users');
    
    if (userCount.count > 0) {
      return res.redirect('/admin/login');
    }

    res.render('setup', { error: null });
  } catch (error) {
    console.error('Error checking users:', error);
    res.render('setup', { error: error.message });
  }
});

// Setup form handler
router.post('/', async (req, res) => {
  try {
    const userCount = await req.db.get('SELECT COUNT(*) as count FROM users');
    
    if (userCount.count > 0) {
      return res.redirect('/admin/login');
    }

    const { username, password, confirm_password } = req.body;

    // Validation
    if (!username || username.length < 3) {
      return res.render('setup', { error: 'Username must be at least 3 characters long' });
    }

    if (!password || password.length < 6) {
      return res.render('setup', { error: 'Password must be at least 6 characters long' });
    }

    if (password !== confirm_password) {
      return res.render('setup', { error: 'Passwords do not match' });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create admin user
    await req.db.run(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, password_hash, 'admin']
    );

    console.log(`Admin user '${username}' created successfully`);
    res.redirect('/admin/login');

  } catch (error) {
    console.error('Error creating admin user:', error);
    res.render('setup', { error: error.message });
  }
});

module.exports = router;