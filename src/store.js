const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'destinations.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([], null, 2));
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function list() {
  return readAll();
}

function getEnabled() {
  return readAll().filter((d) => d.enabled);
}

function add({ platform, name, url, streamKey, enabled }) {
  const items = readAll();
  const item = {
    id: crypto.randomUUID(),
    platform: platform || 'custom',
    name: name || platform || 'Destino',
    url: (url || '').trim(),
    streamKey: (streamKey || '').trim(),
    enabled: enabled !== false,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  writeAll(items);
  return item;
}

function update(id, patch) {
  const items = readAll();
  const idx = items.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  writeAll(items);
  return items[idx];
}

function remove(id) {
  const items = readAll();
  const next = items.filter((d) => d.id !== id);
  writeAll(next);
  return next.length !== items.length;
}

module.exports = { list, getEnabled, add, update, remove };
