const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── Supabase clients ──────────────────────────────────────
function getSB() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}
function getAdminSB() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ── Rate limiter for submissions ──────────────────────────
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Config endpoint (injects Supabase keys server-side) ───
app.get('/config', (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY
  });
});

// ── Admin login ───────────────────────────────────────────
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// ── Organizer login (verifies bcrypt hash) ────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const sb = getAdminSB();
    const { data, error } = await sb
      .from('hj_hackathons')
      .select('*')
      .eq('username', username)
      .single();
    if (error || !data) return res.status(401).json({ ok: false });

    // support both plain-text (old) and hashed (new) passwords
    let valid = false;
    if (data.pw_hashed) {
      valid = await bcrypt.compare(password, data.password);
    } else {
      valid = password === data.password;
      // migrate to hashed on successful plain-text login
      if (valid) {
        const hash = await bcrypt.hash(password, 10);
        await sb.from('hj_hackathons')
          .update({ password: hash, pw_hashed: true })
          .eq('id', data.id);
      }
    }
    if (!valid) return res.status(401).json({ ok: false });

    // strip password before sending to client
    const { password: _p, ...safeHK } = data;
    res.json({ ok: true, hackathon: safeHK });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Create hackathon (hashes password) ───────────────────
app.post('/api/hackathon', async (req, res) => {
  const { title, username, password, teams, judges, categories } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const sb = getAdminSB();
    const { data, error } = await sb
      .from('hj_hackathons')
      .insert({ title, username, password: hash, pw_hashed: true, teams, judges, categories })
      .select()
      .single();
    if (error) throw error;
    const { password: _p, ...safeHK } = data;
    res.json({ ok: true, data: safeHK });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Update hackathon ──────────────────────────────────────
app.put('/api/hackathon/:id', async (req, res) => {
  const { title, username, password } = req.body;
  try {
    const sb = getAdminSB();
    const updates = { title, username };
    if (password) {
      updates.password = await bcrypt.hash(password, 10);
      updates.pw_hashed = true;
    }
    const { error } = await sb
      .from('hj_hackathons')
      .update(updates)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
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
      hackathon_id, team_name, project_name, description,
      github_url: github_url || null,
      shared_url: shared_url || null,
      photos: photos || [],
      status: 'pending'
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Fallback: serve index.html ────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Hackathon platform running on port ${PORT}`);
});
