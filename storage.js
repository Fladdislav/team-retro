const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_DIR = path.join(DATA_DIR, 'rooms');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ROOMS_DIR)) {
  fs.mkdirSync(ROOMS_DIR, { recursive: true });
}

// In-memory cache for rooms
const memoryCache = new Map();
const pendingSaves = new Map();

function transliterate(text) {
  const ru = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return String(text || '').split('').map(c => {
    const l = c.toLowerCase();
    return ru[l] !== undefined ? ru[l] : c;
  }).join('');
}

function sanitizeRoomId(roomId) {
  const transliterated = transliterate(roomId);
  const slug = transliterated
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  return slug || ('retro-' + Date.now().toString(36));
}

function getRoomFilePath(roomId) {
  const safeId = sanitizeRoomId(roomId);
  return path.join(ROOMS_DIR, `${safeId}.json`);
}

function loadRoomFromDisk(roomId) {
  const filePath = getRoomFilePath(roomId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    memoryCache.set(data.id, data);
    return data;
  } catch (err) {
    console.error(`Failed to load room ${roomId}:`, err);
    return null;
  }
}

function saveRoomToDisk(room) {
  if (!room || !room.id) return;
  const filePath = getRoomFilePath(room.id);
  try {
    fs.writeFileSync(filePath, JSON.stringify(room, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save room ${room.id}:`, err);
  }
}

function scheduleSave(room) {
  if (!room || !room.id) return;
  memoryCache.set(room.id, room);
  
  if (pendingSaves.has(room.id)) {
    clearTimeout(pendingSaves.get(room.id));
  }
  
  const timer = setTimeout(() => {
    pendingSaves.delete(room.id);
    saveRoomToDisk(room);
  }, 300); // 300ms debounce
  
  pendingSaves.set(room.id, timer);
}

function getRoom(roomId) {
  const safeId = sanitizeRoomId(roomId);
  if (memoryCache.has(safeId)) {
    return memoryCache.get(safeId);
  }
  return loadRoomFromDisk(safeId);
}

function saveRoom(room) {
  room.updatedAt = Date.now();
  scheduleSave(room);
}

function saveRoomImmediate(room) {
  room.updatedAt = Date.now();
  memoryCache.set(room.id, room);
  if (pendingSaves.has(room.id)) {
    clearTimeout(pendingSaves.get(room.id));
    pendingSaves.delete(room.id);
  }
  saveRoomToDisk(room);
}

function listRooms() {
  try {
    const files = fs.readdirSync(ROOMS_DIR);
    const rooms = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.replace(/\.json$/, '');
      const room = getRoom(id);
      if (room) {
        rooms.push({
          id: room.id,
          title: room.title || 'Ретроспектива',
          template: room.template || 'classic',
          createdAt: room.createdAt || Date.now(),
          updatedAt: room.updatedAt || Date.now(),
          cardCount: (room.cards || []).length,
          actionCount: (room.actionItems || []).length,
          stage: room.stage || 'icebreaker'
        });
      }
    }
    return rooms.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Failed to list rooms:', err);
    return [];
  }
}

function deleteRoom(roomId) {
  const safeId = sanitizeRoomId(roomId);
  memoryCache.delete(safeId);
  if (pendingSaves.has(safeId)) {
    clearTimeout(pendingSaves.get(safeId));
    pendingSaves.delete(safeId);
  }
  const filePath = getRoomFilePath(safeId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  sanitizeRoomId,
  getRoom,
  saveRoom,
  saveRoomImmediate,
  listRooms,
  deleteRoom
};
