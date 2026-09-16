/* ACCOUNTS, AND THE SAVE THAT BELONGS TO ONE.
   ==========================================================================
   Everything the game remembers used to live in the browser, which meant a
   career belonged to a machine rather than to a person: clear the site data,
   or open it on the laptop instead of the desktop, and it was gone. This is
   the whole of the other side -- one function, five actions, one Postgres
   database on Neon.

   WHAT IT IS NOT. There is no email, no reset link, no third-party sign-in.
   A username, a password, and a recovery code printed once at sign-up, which
   is the only way back in if the password goes. That is what was asked for
   and it is also, for a game save, the honest trade: nobody wants to give an
   address to a racing game.

   HOW PASSWORDS ARE KEPT. Never in the clear, and never reversibly. PBKDF2
   over SHA-256, 210,000 iterations, a fresh 16-byte salt each -- the figure
   OWASP publishes for PBKDF2-SHA256 -- and the comparison is
   timingSafeEqual, so a wrong password takes exactly as long to reject as a
   right one takes to accept. The recovery code is hashed the same way: what
   is in the table is useless to anyone who reads the table.

   The save itself is one JSON document per player, written whole. It is a
   few kilobytes of career, laps and settings; there is nothing to gain from
   splitting it into columns and plenty to lose, because the game's own
   shape changes every week and a blob does not care.
   ========================================================================== */
import { neon } from '@neondatabase/serverless';
import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';

const ITERATIONS = 210000;
const KEYLEN = 32;
const DIGEST = 'sha256';
const SESSION_DAYS = 90;
/* A code that gets read aloud and typed in, so no O, 0, I or 1 in it. */
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SAVE = 512 * 1024;            // a save is a few kB; this is a wall, not a budget

let _sql = null;
function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('no database configured');
    _sql = neon(url);
  }
  return _sql;
}

/* The tables, made once and then never thought about again. Running this on
   every cold start costs one round trip and removes a deployment step that
   somebody would otherwise have to remember. */
let _ready = null;
async function ready() {
  if (!_ready) {
    const sql = db();
    _ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS players (
        id            SERIAL PRIMARY KEY,
        username      TEXT NOT NULL,
        uname_lower   TEXT NOT NULL UNIQUE,
        pass_hash     TEXT NOT NULL,
        pass_salt     TEXT NOT NULL,
        recovery_hash TEXT NOT NULL,
        recovery_salt TEXT NOT NULL,
        save          JSONB,
        saved_at      TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id)`;
    })();
  }
  return _ready;
}

const hash = (secret, salt) =>
  pbkdf2Sync(String(secret), salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');

/* Constant time, so the answer cannot be timed out of it one character at a
   time. Length is checked first because timingSafeEqual throws on a mismatch. */
function same(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function recoveryCode() {
  const pick = n => Array.from(randomBytes(n)).map(b => CODE_ALPHA[b % CODE_ALPHA.length]).join('');
  return `SLIP-${pick(4)}-${pick(4)}-${pick(4)}`;
}
/* Typed back in by a human, so it is compared without its dashes, spaces or
   case -- the code is the entropy, not the punctuation. */
const tidyCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newSession() {
  return randomBytes(32).toString('hex');
}

/* A username is a name, not a free-text field: it ends up on a results
   screen. Three to twenty characters, letters, digits, and the three
   separators people actually use. */
function badUsername(u) {
  if (typeof u !== 'string') return 'Enter a username';
  const s = u.trim();
  if (s.length < 3) return 'Usernames are at least 3 characters';
  if (s.length > 20) return 'Usernames are at most 20 characters';
  if (!/^[A-Za-z0-9._-]+$/.test(s)) return 'Letters, numbers, dots, dashes and underscores only';
  return null;
}
function badPassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Passwords are at least 8 characters';
  if (p.length > 200) return 'That password is too long';
  return null;
}

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};

/* Who is asking. Every action past sign-in takes a token and nothing else --
   there is no "trust the username in the body" path anywhere in here. */
async function playerFor(token) {
  if (!token || typeof token !== 'string') return null;
  const sql = db();
  const rows = await sql`
    SELECT p.id, p.username, p.saved_at
      FROM sessions s JOIN players p ON p.id = s.player_id
     WHERE s.token = ${token} AND s.expires_at > now()`;
  return rows[0] || null;
}

async function startSession(sql, playerId) {
  const token = newSession();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await sql`INSERT INTO sessions (token, player_id, expires_at)
            VALUES (${token}, ${playerId}, ${expires.toISOString()})`;
  /* Sweep this player's dead sessions while we are here: a logged-out browser
     leaves one behind and nothing else would ever collect them. */
  await sql`DELETE FROM sessions WHERE player_id = ${playerId} AND expires_at < now()`;
  return { token, expires: expires.toISOString() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Bad request' });

  const action = String(body.action || '');

  try {
    await ready();
    const sql = db();

    /* ---------------------------------------------------------- sign up */
    if (action === 'create') {
      const nameErr = badUsername(body.username);
      if (nameErr) return send(res, 400, { error: nameErr });
      const passErr = badPassword(body.password);
      if (passErr) return send(res, 400, { error: passErr });

      const username = body.username.trim();
      const lower = username.toLowerCase();
      const taken = await sql`SELECT 1 FROM players WHERE uname_lower = ${lower}`;
      if (taken.length) return send(res, 409, { error: 'That name is taken' });

      const code = recoveryCode();
      const pSalt = randomBytes(16).toString('hex');
      const rSalt = randomBytes(16).toString('hex');
      const rows = await sql`
        INSERT INTO players (username, uname_lower, pass_hash, pass_salt, recovery_hash, recovery_salt, save, saved_at)
        VALUES (${username}, ${lower}, ${hash(body.password, pSalt)}, ${pSalt},
                ${hash(tidyCode(code), rSalt)}, ${rSalt},
                ${body.save ? JSON.stringify(body.save) : null}, ${body.save ? new Date().toISOString() : null})
        RETURNING id, username`;
      const player = rows[0];
      const session = await startSession(sql, player.id);
      /* The only time the code is ever readable. It is not stored in a form
         anybody -- including this function -- can read back. */
      return send(res, 200, { username: player.username, recovery: code, ...session, save: body.save || null });
    }

    /* ---------------------------------------------------------- sign in */
    if (action === 'login') {
      const lower = String(body.username || '').trim().toLowerCase();
      const rows = await sql`SELECT id, username, pass_hash, pass_salt, save FROM players WHERE uname_lower = ${lower}`;
      const p = rows[0];
      /* One message for both halves: saying "no such user" tells anyone with
         a list which of their guesses are worth pursuing. */
      const wrong = { error: 'Wrong username or password' };
      if (!p) { hash(String(body.password || ''), 'decoy'); return send(res, 401, wrong); }
      if (!same(hash(String(body.password || ''), p.pass_salt), p.pass_hash)) return send(res, 401, wrong);
      const session = await startSession(sql, p.id);
      return send(res, 200, { username: p.username, save: p.save || null, ...session });
    }

    /* ------------------------------------------------- forgotten password */
    if (action === 'recover') {
      const lower = String(body.username || '').trim().toLowerCase();
      const passErr = badPassword(body.password);
      if (passErr) return send(res, 400, { error: passErr });
      const rows = await sql`SELECT id, username, recovery_hash, recovery_salt, save FROM players WHERE uname_lower = ${lower}`;
      const p = rows[0];
      const wrong = { error: 'That recovery code does not match that account' };
      if (!p) { hash('decoy', 'decoy'); return send(res, 401, wrong); }
      if (!same(hash(tidyCode(body.code), p.recovery_salt), p.recovery_hash)) return send(res, 401, wrong);

      /* A used code is spent, and a new one is issued in its place -- leaving
         the old one live would mean a code written on a bit of paper years
         ago still opens the account. Every existing session goes with it,
         which is the whole point of a password reset. */
      const code = recoveryCode();
      const pSalt = randomBytes(16).toString('hex');
      const rSalt = randomBytes(16).toString('hex');
      await sql`UPDATE players SET pass_hash = ${hash(body.password, pSalt)}, pass_salt = ${pSalt},
                                   recovery_hash = ${hash(tidyCode(code), rSalt)}, recovery_salt = ${rSalt}
                 WHERE id = ${p.id}`;
      await sql`DELETE FROM sessions WHERE player_id = ${p.id}`;
      const session = await startSession(sql, p.id);
      return send(res, 200, { username: p.username, recovery: code, save: p.save || null, ...session });
    }

    /* ------------------------------------------------------- who am i */
    if (action === 'me') {
      const p = await playerFor(body.token);
      if (!p) return send(res, 401, { error: 'Signed out' });
      const rows = await sql`SELECT save, saved_at FROM players WHERE id = ${p.id}`;
      return send(res, 200, { username: p.username, save: rows[0].save || null, savedAt: rows[0].saved_at });
    }

    /* --------------------------------------------------------- the save */
    if (action === 'save') {
      const p = await playerFor(body.token);
      if (!p) return send(res, 401, { error: 'Signed out' });
      if (body.save === undefined) return send(res, 400, { error: 'Nothing to save' });
      const text = JSON.stringify(body.save);
      if (text.length > MAX_SAVE) return send(res, 413, { error: 'That save is too large' });
      const now = new Date().toISOString();
      await sql`UPDATE players SET save = ${text}::jsonb, saved_at = ${now} WHERE id = ${p.id}`;
      return send(res, 200, { ok: true, savedAt: now });
    }

    /* -------------------------------------------------------- sign out */
    if (action === 'logout') {
      if (body.token) await sql`DELETE FROM sessions WHERE token = ${body.token}`;
      return send(res, 200, { ok: true });
    }

    /* ------------------------------------------- a fresh recovery code */
    if (action === 'newcode') {
      const p = await playerFor(body.token);
      if (!p) return send(res, 401, { error: 'Signed out' });
      const code = recoveryCode();
      const rSalt = randomBytes(16).toString('hex');
      await sql`UPDATE players SET recovery_hash = ${hash(tidyCode(code), rSalt)}, recovery_salt = ${rSalt}
                 WHERE id = ${p.id}`;
      return send(res, 200, { recovery: code });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (err) {
    /* The message goes to the log, never to the browser: a database error
       reads like a map of the database. */
    console.error('account:', action, err && err.message);
    return send(res, 500, { error: 'The server could not do that. Try again.' });
  }
}

/* The pure parts, for the tests. Nothing here touches the database. */
export const _test = { hash, same, recoveryCode, tidyCode, badUsername, badPassword,
                       ITERATIONS, CODE_ALPHA, createHash };
