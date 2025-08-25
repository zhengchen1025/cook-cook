// src/index.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// helpers
const {
  sendError,
  isNonEmptyString,
  isStringOrEmpty,
  isPlainObject,
  ensureArray
} = require('./utils/validate');

// --- Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// --- In-memory store (simple)
const recipes = [];
let nextRecipeId = 1;
let nextAttemptId = 1;
function genRecipeId() { return String(nextRecipeId++); }
function genAttemptId() { return String(nextAttemptId++); }
function nowISO() { return new Date().toISOString(); }

// --- Create recipe
// Expected JSON body: { title: "...", body: "optional text", images: ["..."], feedback: "..." }
app.post('/api/recipes', (req, res) => {
  const payload = req.body || {};
  if (!isNonEmptyString(payload.title)) {
    return sendError(res, 400, 'title is required and must be a non-empty string');
  }

  const recipe = {
    id: genRecipeId(),
    title: payload.title.trim(),
    body: isStringOrEmpty(payload.body) ? payload.body : '',
    feedback: isStringOrEmpty(payload.feedback) ? payload.feedback : '',
    images: ensureArray(payload.images),
    attempts: [], // will hold attempt objects later
    createdAt: nowISO(),
    updatedAt: nowISO(),
    meta: isPlainObject(payload.meta) ? payload.meta : {},
    authorId: payload.authorId || null
  };

  recipes.push(recipe);
  res.status(201).json(recipe);
});

// --- List recipes
// Supports optional ?q=searchText
app.get('/api/recipes', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let list = recipes.slice().reverse(); // newest first
  if (q) {
    list = list.filter(r =>
      (r.title && r.title.toLowerCase().includes(q)) ||
      (r.body && r.body.toLowerCase().includes(q)) ||
      (r.feedback && r.feedback.toLowerCase().includes(q))
    );
  }
  res.json({ total: list.length, items: list });
});

// --- Get single recipe
app.get('/api/recipes/:id', (req, res) => {
  const id = req.params.id;
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return sendError(res, 404, 'recipe not found');
  res.json(recipe);
});

// --- Update recipe (partial)
app.put('/api/recipes/:id', (req, res) => {
  const id = req.params.id;
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return sendError(res, 404, 'recipe not found');

  const payload = req.body || {};
  if (payload.title !== undefined && !isNonEmptyString(payload.title)) {
    return sendError(res, 400, 'title must be a non-empty string when provided');
  }
  if (payload.body !== undefined && !isStringOrEmpty(payload.body)) return sendError(res, 400, 'body must be a string');
  if (payload.feedback !== undefined && !isStringOrEmpty(payload.feedback)) return sendError(res, 400, 'feedback must be a string');
  if (payload.images !== undefined && !Array.isArray(payload.images)) return sendError(res, 400, 'images must be an array');
  if (payload.meta !== undefined && !isPlainObject(payload.meta)) return sendError(res, 400, 'meta must be an object');

  if (payload.title !== undefined) recipe.title = payload.title.trim();
  if (payload.body !== undefined) recipe.body = payload.body;
  if (payload.feedback !== undefined) recipe.feedback = payload.feedback;
  if (payload.images !== undefined) recipe.images = payload.images;
  if (payload.meta !== undefined) recipe.meta = payload.meta;
  recipe.updatedAt = nowISO();

  res.json(recipe);
});

// --- Delete recipe
app.delete('/api/recipes/:id', (req, res) => {
  const id = req.params.id;
  const idx = recipes.findIndex(r => r.id === id);
  if (idx === -1) return sendError(res, 404, 'recipe not found');
  recipes.splice(idx, 1);
  res.status(204).send();
});

// --- Add attempt to a recipe
// Expected body: { body: "描述此次尝试", feedback: "可选", images: [], meta: {} }
app.post('/api/recipes/:id/attempts', (req, res) => {
  const id = req.params.id;
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return sendError(res, 404, 'recipe not found');

  const payload = req.body || {};
  if (!isNonEmptyString(payload.body)) {
    return sendError(res, 400, 'attempt body is required and must be a non-empty string');
  }

  const attempt = {
    id: genAttemptId(),
    body: payload.body,
    feedback: isStringOrEmpty(payload.feedback) ? payload.feedback : '',
    images: ensureArray(payload.images),
    createdAt: nowISO(),
    meta: isPlainObject(payload.meta) ? payload.meta : {}
  };

  recipe.attempts.push(attempt);
  recipe.updatedAt = nowISO();
  res.status(201).json(attempt);
});

// --- List attempts for a recipe
app.get('/api/recipes/:id/attempts', (req, res) => {
  const id = req.params.id;
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return sendError(res, 404, 'recipe not found');

  const list = recipe.attempts.slice().reverse(); // newest first
  res.json({ total: list.length, items: list });
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('<h1>Cook Cook API</h1><p>Visit /api/ping</p>');
});

app.post('/api/echo', (req, res) => {
  res.json({ youSent: req.body });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});