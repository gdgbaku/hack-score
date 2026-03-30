const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── Supabase client ───────────────────────────────────────
// Using anon key for all operations — RLS policies are open.
// Will switch to service key in Phase 1 when RLS is tightened.
function getSB() {
  return createClient(
    (process.env.SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_KEY || '').trim()
  );
}
// alias — both use same key until RLS is tightened
const getAdminSB = getSB;

// ── Rate limiter for submissions ──────────────────────────
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Config endpoint ───────────────────────────────────────
app.get('/config', (req, res) => {
  res.json({
    url: (process.env.SUPABASE_URL || '').trim(),
    key: (process.env.SUPABASE_KEY || '').trim()
  });
});

// ── Admin login ───────────────────────────────────────────
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }
  const adminUser = (process.env.ADMIN_USERNAME || '').trim();
  const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (username === adminUser && password === adminPass) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// ── Organizer login ───────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }
  try {
    const sb = getAdminSB();
    const { data, error } = await sb
      .from('hj_hackathons')
      .select('*')
      .eq('username', username.trim())
      .single();
    if (error || !data) return res.status(401).json({ ok: false });

    let valid = false;
    if (data.pw_hashed) {
      valid = await bcrypt.compare(password, data.password);
    } else {
      // plain-text password (old accounts before hashing was added)
      valid = password === data.password;
      if (valid) {
        // auto-migrate to hashed
        const hash = await bcrypt.hash(password, 10);
        await sb.from('hj_hackathons')
          .update({ password: hash, pw_hashed: true })
          .eq('id', data.id);
      }
    }
    if (!valid) return res.status(401).json({ ok: false });

    const { password: _p, pw_hashed: _h, ...safeHK } = data;
    res.json({ ok: true, hackathon: safeHK });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Create hackathon ──────────────────────────────────────
app.post('/api/hackathon', async (req, res) => {
  const { title, username, password, teams, judges, categories } = req.body;
  if (!title || !username || !password) {
    return res.status(400).json({ ok: false, error: 'Title, username and password are required.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const sb = getAdminSB();
    const { data, error } = await sb
      .from('hj_hackathons')
      .insert({
        title,
        username: username.trim().toLowerCase(),
        password: hash,
        pw_hashed: true,
        teams: teams || [],
        judges: judges || [],
        categories: categories || []
      })
      .select()
      .single();
    if (error) throw error;
    const { password: _p, pw_hashed: _h, ...safeHK } = data;
    res.json({ ok: true, data: safeHK });
  } catch (e) {
    console.error('Create hackathon error:', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Update hackathon (title + username only) ──────────────
app.put('/api/hackathon/:id', async (req, res) => {
  const { title, username } = req.body;
  if (!title || !username) {
    return res.status(400).json({ ok: false, error: 'Title and username are required.' });
  }
  try {
    const sb = getAdminSB();
    const { error } = await sb
      .from('hj_hackathons')
      .update({ title, username: username.trim().toLowerCase() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('Update hackathon error:', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Reset organizer password (admin only) ─────────────────
app.post('/api/hackathon/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const sb = getAdminSB();
    const { error } = await sb
      .from('hj_hackathons')
      .update({ password: hash, pw_hashed: true })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('Reset password error:', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Delete hackathon ──────────────────────────────────────
app.delete('/api/hackathon/:id', async (req, res) => {
  try {
    const sb = getAdminSB();
    const { error } = await sb.from('hj_hackathons').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete hackathon error:', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Team submission (rate limited) ────────────────────────
app.post('/api/submit', submitLimiter, async (req, res) => {
  const { hackathon_id, team_name, project_name, description, github_url, shared_url, photos } = req.body;
  if (!hackathon_id || !team_name || !project_name || !description) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const sb = getAdminSB();
    const { error } = await sb.from('hj_submissions').insert({
      hackathon_id,
      team_name,
      project_name,
      description,
      github_url: github_url || null,
      shared_url: shared_url || null,
      photos: photos || [],
      status: 'pending'
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('Submit error:', e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Hackathon platform running on port ${PORT}`);
});
