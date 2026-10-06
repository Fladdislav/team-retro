const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');

const { RETRO_TEMPLATES, DEFAULT_STAGES, DEFAULT_TAGS } = require('./templates');
const storage = require('./storage');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Active in-memory room sessions: roomId -> { participants: Map(socketId -> user), timerInterval: timer }
const roomSessions = new Map();

function getOrCreateSession(roomId) {
  if (!roomSessions.has(roomId)) {
    roomSessions.set(roomId, {
      participants: new Map(),
      timerInterval: null
    });
  }
  return roomSessions.get(roomId);
}

function createRoomData(params) {
  const templateKey = params.template && RETRO_TEMPLATES[params.template] ? params.template : 'classic';
  const template = RETRO_TEMPLATES[templateKey];
  let roomId = storage.sanitizeRoomId(params.id || params.title || 'retro');
  
  // If not explicitly specifying an ID and a room with this ID already exists, append a suffix
  if (!params.id && storage.getRoom(roomId)) {
    roomId = `${roomId}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const initialColumns = (params.columns && params.columns.length > 0)
    ? params.columns
    : template.columns.map(c => ({
        id: c.id,
        title: c.title,
        color: c.color,
        description: c.description || ''
      }));

  const room = {
    id: roomId,
    title: params.title || 'Ретроспектива команды',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    facilitatorToken: params.facilitatorToken || crypto.randomUUID(),
    template: templateKey,
    stage: 'icebreaker', // icebreaker, brainstorm, group, vote, actions, summary
    blurCards: false, // hide cards while brainstorming
    votesPerUser: Number(params.votesPerUser) || 5,
    columns: initialColumns,
    cards: [],
    actionItems: [],
    icebreaker: {
      question: params.icebreakerQuestion || 'Как прошёл этот спринт? Оцените общее самочувствие и результат команды:',
      answers: {} // userId -> { mood: 1-5, emoji: '🚀', note: '...', userName: '...' }
    },
    timer: {
      running: false,
      durationSeconds: 300,
      remainingSeconds: 300,
      endsAt: null
    },
    notes: ''
  };

  storage.saveRoomImmediate(room);
  return room;
}

// REST Endpoints
app.get('/api/templates', (req, res) => {
  res.json({
    templates: Object.values(RETRO_TEMPLATES),
    stages: DEFAULT_STAGES,
    tags: DEFAULT_TAGS
  });
});

app.get('/api/rooms', (req, res) => {
  const rooms = storage.listRooms();
  res.json({ rooms });
});

app.post('/api/rooms', (req, res) => {
  try {
    const room = createRoomData(req.body || {});
    res.json({
      success: true,
      room: {
        id: room.id,
        title: room.title,
        facilitatorToken: room.facilitatorToken
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms/:id', (req, res) => {
  const room = storage.getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ room });
});

app.delete('/api/rooms/:id', (req, res) => {
  storage.deleteRoom(req.params.id);
  res.json({ success: true });
});

// Export endpoints
app.get('/api/rooms/:id/export/:format', (req, res) => {
  const room = storage.getRoom(req.params.id);
  if (!room) {
    return res.status(404).send('Комната не найдена');
  }

  const format = req.params.format;
  const fileName = `retro-${room.id}-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'markdown' || format === 'md') {
    let md = `# ${room.title}\n\n`;
    md += `**Дата:** ${new Date(room.createdAt).toLocaleString('ru-RU')}\n`;
    md += `**Шаблон:** ${RETRO_TEMPLATES[room.template]?.name || room.template}\n\n`;

    // Icebreaker
    if (room.icebreaker && Object.keys(room.icebreaker.answers || {}).length > 0) {
      const answers = Object.values(room.icebreaker.answers);
      const avg = (answers.reduce((acc, a) => acc + (a.mood || 0), 0) / answers.length).toFixed(1);
      md += `## 🌡️ Пульс команды (Настроение: ${avg}/5)\n`;
      answers.forEach(a => {
        md += `- ${a.userName || 'Аноним'}: ${a.emoji || '🙂'} (${a.mood}/5)${a.note ? ` — "${a.note}"` : ''}\n`;
      });
      md += '\n';
    }

    // Cards by column
    md += `## 📋 Карточки ретроспективы\n\n`;
    (room.columns || []).forEach(col => {
      const colCards = (room.cards || []).filter(c => c.columnId === col.id);
      md += `### ${col.title} (${colCards.length})\n`;
      if (colCards.length === 0) {
        md += `*Нет карточек*\n\n`;
      } else {
        // Sort by votes descending
        colCards.sort((a, b) => ((b.votes || []).length) - ((a.votes || []).length));
        colCards.forEach(c => {
          const voteCount = (c.votes || []).length;
          const author = c.isAnonymous ? 'Анонимно' : (c.authorName || 'Участник');
          const tags = (c.tags && c.tags.length > 0) ? ` [${c.tags.join(', ')}]` : '';
          const votesStr = voteCount > 0 ? ` (👍 ${voteCount})` : '';
          md += `- **${c.text}**${votesStr} — *${author}*${tags}\n`;
        });
        md += '\n';
      }
    });

    // Action Items
    md += `## ✅ План действий (Action Items)\n\n`;
    if (!room.actionItems || room.actionItems.length === 0) {
      md += `*План действий не зафиксирован*\n`;
    } else {
      room.actionItems.forEach(action => {
        const check = action.completed ? '[x]' : '[ ]';
        const assignee = action.assignee ? ` (@${action.assignee})` : '';
        const due = action.dueDate ? ` [до ${action.dueDate}]` : '';
        md += `- ${check} ${action.text}${assignee}${due}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.md"`);
    return res.send(md);
  }

  if (format === 'csv') {
    let csv = 'Тип,Колонка,Текст,Автор,Голоса,Теги,Статус/Срок\n';
    (room.cards || []).forEach(c => {
      const col = (room.columns || []).find(col => col.id === c.columnId);
      const colTitle = `"${(col ? col.title : '').replace(/"/g, '""')}"`;
      const text = `"${(c.text || '').replace(/"/g, '""')}"`;
      const author = `"${(c.isAnonymous ? 'Аноним' : (c.authorName || '')).replace(/"/g, '""')}"`;
      const votes = (c.votes || []).length;
      const tags = `"${(c.tags || []).join('; ').replace(/"/g, '""')}"`;
      csv += `Карточка,${colTitle},${text},${author},${votes},${tags},\n`;
    });

    (room.actionItems || []).forEach(a => {
      const text = `"${(a.text || '').replace(/"/g, '""')}"`;
      const assignee = `"${(a.assignee || '').replace(/"/g, '""')}"`;
      const status = a.completed ? 'Выполнено' : 'В работе';
      const due = a.dueDate || '';
      csv += `Действие,,${text},${assignee},,,"${status} / ${due}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
    return res.send('\uFEFF' + csv); // add UTF-8 BOM for Excel
  }

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.json"`);
    return res.json(room);
  }

  res.status(400).send('Unsupported format');
});

// Fallback direct routes to pages
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'retro.html'));
});

app.get('/retro/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'retro.html'));
});

// Socket.IO Real-time Synchronization
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  function broadcastParticipants(roomId) {
    const session = getOrCreateSession(roomId);
    const list = Array.from(session.participants.values());
    io.to(roomId).emit('participants-updated', list);
  }

  function broadcastRoomUpdate(room) {
    storage.saveRoom(room);
    io.to(room.id).emit('room-updated', room);
  }

  function handleTimerTick(roomId) {
    const room = storage.getRoom(roomId);
    if (!room || !room.timer || !room.timer.running) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000));
    room.timer.remainingSeconds = remaining;

    if (remaining <= 0) {
      room.timer.running = false;
      room.timer.endsAt = null;
      const session = getOrCreateSession(roomId);
      if (session.timerInterval) {
        clearInterval(session.timerInterval);
        session.timerInterval = null;
      }
      storage.saveRoomImmediate(room);
      io.to(roomId).emit('timer-tick', room.timer);
      io.to(roomId).emit('timer-ended');
    } else {
      io.to(roomId).emit('timer-tick', room.timer);
    }
  }

  socket.on('join-room', ({ roomId, user }) => {
    currentRoomId = storage.sanitizeRoomId(roomId);
    currentUser = {
      socketId: socket.id,
      id: user.id || socket.id,
      name: user.name || 'Участник',
      avatar: user.avatar || '🦊',
      color: user.color || '#3b82f6',
      joinedAt: Date.now()
    };

    socket.join(currentRoomId);
    const session = getOrCreateSession(currentRoomId);
    session.participants.set(socket.id, currentUser);

    let room = storage.getRoom(currentRoomId);
    if (!room) {
      room = createRoomData({ id: currentRoomId, title: 'Ретроспектива ' + currentRoomId });
    }

    // Send initial full room state to the joining user
    socket.emit('room-init', {
      room,
      user: currentUser,
      stages: DEFAULT_STAGES,
      availableTags: DEFAULT_TAGS
    });

    broadcastParticipants(currentRoomId);
  });

  // Stage changes
  socket.on('change-stage', ({ stage }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    room.stage = stage;
    // Auto blur rule: during brainstorm, encourage blur if enabled
    broadcastRoomUpdate(room);
  });

  // Blur toggle
  socket.on('toggle-blur', ({ blurCards }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    room.blurCards = !!blurCards;
    broadcastRoomUpdate(room);
  });

  // Timer controls
  socket.on('timer-start', ({ durationSeconds }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const seconds = durationSeconds ? Number(durationSeconds) : (room.timer.remainingSeconds || 300);
    room.timer.running = true;
    room.timer.durationSeconds = seconds;
    room.timer.remainingSeconds = seconds;
    room.timer.endsAt = Date.now() + seconds * 1000;

    const session = getOrCreateSession(currentRoomId);
    if (session.timerInterval) clearInterval(session.timerInterval);

    session.timerInterval = setInterval(() => {
      handleTimerTick(currentRoomId);
    }, 1000);

    storage.saveRoom(room);
    io.to(currentRoomId).emit('timer-tick', room.timer);
  });

  socket.on('timer-pause', () => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room || !room.timer) return;

    room.timer.running = false;
    room.timer.endsAt = null;

    const session = getOrCreateSession(currentRoomId);
    if (session.timerInterval) {
      clearInterval(session.timerInterval);
      session.timerInterval = null;
    }

    storage.saveRoom(room);
    io.to(currentRoomId).emit('timer-tick', room.timer);
  });

  socket.on('timer-reset', ({ durationSeconds }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room || !room.timer) return;

    const seconds = Number(durationSeconds) || 300;
    room.timer.running = false;
    room.timer.durationSeconds = seconds;
    room.timer.remainingSeconds = seconds;
    room.timer.endsAt = null;

    const session = getOrCreateSession(currentRoomId);
    if (session.timerInterval) {
      clearInterval(session.timerInterval);
      session.timerInterval = null;
    }

    storage.saveRoom(room);
    io.to(currentRoomId).emit('timer-tick', room.timer);
  });

  // Icebreaker / Mood check-in
  socket.on('submit-icebreaker', ({ mood, emoji, note }) => {
    if (!currentRoomId || !currentUser) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    if (!room.icebreaker) room.icebreaker = { question: '', answers: {} };
    if (!room.icebreaker.answers) room.icebreaker.answers = {};

    room.icebreaker.answers[currentUser.id] = {
      userId: currentUser.id,
      userName: currentUser.name,
      avatar: currentUser.avatar,
      mood: Number(mood) || 3,
      emoji: emoji || '🙂',
      note: String(note || '').slice(0, 300),
      submittedAt: Date.now()
    };

    broadcastRoomUpdate(room);
  });

  // Card Operations
  socket.on('card-add', ({ columnId, text, isAnonymous, tags, color }) => {
    if (!currentRoomId || !currentUser) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const trimmedText = String(text || '').trim();
    if (!trimmedText) return;

    const newCard = {
      id: 'card-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      columnId,
      text: trimmedText,
      authorId: currentUser.id,
      authorName: isAnonymous ? 'Аноним' : currentUser.name,
      authorAvatar: isAnonymous ? '🎭' : currentUser.avatar,
      isAnonymous: !!isAnonymous,
      tags: Array.isArray(tags) ? tags : [],
      color: color || 'default',
      votes: [], // list of userIds
      reactions: {}, // emoji -> [userIds]
      groupId: null,
      createdAt: Date.now()
    };

    room.cards.push(newCard);
    broadcastRoomUpdate(room);
    io.to(currentRoomId).emit('sound-event', { type: 'card-added' });
  });

  socket.on('card-edit', ({ cardId, text, tags, color }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const card = room.cards.find(c => c.id === cardId);
    if (!card) return;

    if (text !== undefined) card.text = String(text).trim();
    if (tags !== undefined) card.tags = Array.isArray(tags) ? tags : [];
    if (color !== undefined) card.color = color;

    broadcastRoomUpdate(room);
  });

  socket.on('card-delete', ({ cardId }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    room.cards = room.cards.filter(c => c.id !== cardId);
    broadcastRoomUpdate(room);
  });

  socket.on('card-move', ({ cardId, targetColumnId, newIndex }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const cardIndex = room.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const [card] = room.cards.splice(cardIndex, 1);
    card.columnId = targetColumnId;

    // Insert into specific position in target column if desired, or append
    room.cards.push(card);
    broadcastRoomUpdate(room);
  });

  // Card Voting (Dot voting)
  socket.on('card-vote', ({ cardId }) => {
    if (!currentRoomId || !currentUser) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const card = room.cards.find(c => c.id === cardId);
    if (!card) return;

    if (!Array.isArray(card.votes)) card.votes = [];

    const existingVoteIndex = card.votes.indexOf(currentUser.id);
    if (existingVoteIndex !== -1) {
      // Remove vote
      card.votes.splice(existingVoteIndex, 1);
    } else {
      // Calculate how many votes this user has already spent
      const totalUserVotes = room.cards.reduce((sum, c) => {
        return sum + (Array.isArray(c.votes) && c.votes.includes(currentUser.id) ? 1 : 0);
      }, 0);

      const maxVotes = room.votesPerUser || 5;
      if (totalUserVotes >= maxVotes) {
        socket.emit('notification', {
          type: 'warning',
          message: `Вы исчерпали лимит голосов (${maxVotes}). Снимите голос с другой карточки, чтобы переголосовать.`
        });
        return;
      }

      card.votes.push(currentUser.id);
      io.to(currentRoomId).emit('sound-event', { type: 'vote-added' });
    }

    broadcastRoomUpdate(room);
  });

  // Card Emoji Reactions
  socket.on('card-reaction', ({ cardId, emoji }) => {
    if (!currentRoomId || !currentUser) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const card = room.cards.find(c => c.id === cardId);
    if (!card) return;

    if (!card.reactions) card.reactions = {};
    if (!Array.isArray(card.reactions[emoji])) card.reactions[emoji] = [];

    const userIdx = card.reactions[emoji].indexOf(currentUser.id);
    if (userIdx !== -1) {
      card.reactions[emoji].splice(userIdx, 1);
      if (card.reactions[emoji].length === 0) {
        delete card.reactions[emoji];
      }
    } else {
      card.reactions[emoji].push(currentUser.id);
    }

    broadcastRoomUpdate(room);
  });

  // Card Grouping / Merging
  socket.on('card-group', ({ sourceCardId, targetCardId, groupTitle }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const sourceCard = room.cards.find(c => c.id === sourceCardId);
    const targetCard = room.cards.find(c => c.id === targetCardId);
    if (!sourceCard || !targetCard || sourceCard.id === targetCard.id) return;

    const groupId = targetCard.groupId || ('group-' + Date.now().toString(36));
    targetCard.groupId = groupId;
    sourceCard.groupId = groupId;
    sourceCard.columnId = targetCard.columnId;

    if (groupTitle) {
      targetCard.groupTitle = groupTitle;
      sourceCard.groupTitle = groupTitle;
    }

    broadcastRoomUpdate(room);
  });

  socket.on('card-ungroup', ({ cardId }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const card = room.cards.find(c => c.id === cardId);
    if (!card) return;

    card.groupId = null;
    card.groupTitle = null;
    broadcastRoomUpdate(room);
  });

  // Action Items Management
  socket.on('action-add', ({ text, assignee, dueDate }) => {
    if (!currentRoomId || !currentUser) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const trimmedText = String(text || '').trim();
    if (!trimmedText) return;

    if (!Array.isArray(room.actionItems)) room.actionItems = [];

    const action = {
      id: 'action-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      text: trimmedText,
      assignee: assignee ? String(assignee).trim() : '',
      dueDate: dueDate || '',
      completed: false,
      createdByName: currentUser.name,
      createdAt: Date.now()
    };

    room.actionItems.push(action);
    broadcastRoomUpdate(room);
    io.to(currentRoomId).emit('sound-event', { type: 'action-added' });
  });

  socket.on('action-toggle', ({ actionId }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room || !Array.isArray(room.actionItems)) return;

    const action = room.actionItems.find(a => a.id === actionId);
    if (!action) return;

    action.completed = !action.completed;
    broadcastRoomUpdate(room);
  });

  socket.on('action-edit', ({ actionId, text, assignee, dueDate }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room || !Array.isArray(room.actionItems)) return;

    const action = room.actionItems.find(a => a.id === actionId);
    if (!action) return;

    if (text !== undefined) action.text = String(text).trim();
    if (assignee !== undefined) action.assignee = String(assignee).trim();
    if (dueDate !== undefined) action.dueDate = dueDate;

    broadcastRoomUpdate(room);
  });

  socket.on('action-delete', ({ actionId }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room || !Array.isArray(room.actionItems)) return;

    room.actionItems = room.actionItems.filter(a => a.id !== actionId);
    broadcastRoomUpdate(room);
  });

  // Settings & Facilitator operations
  socket.on('update-room-title', ({ title }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    room.title = String(title || 'Ретроспектива').trim();
    broadcastRoomUpdate(room);
  });

  socket.on('set-votes-per-user', ({ count }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    room.votesPerUser = Math.max(1, Math.min(20, Number(count) || 5));
    broadcastRoomUpdate(room);
  });

  socket.on('reset-all-votes', () => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    (room.cards || []).forEach(c => {
      c.votes = [];
    });
    broadcastRoomUpdate(room);
  });

  // Confetti / Celebration
  socket.on('trigger-confetti', () => {
    if (!currentRoomId) return;
    io.to(currentRoomId).emit('confetti-fired', {
      senderName: currentUser ? currentUser.name : 'Команда'
    });
  });

  // Column management
  socket.on('column-add', ({ title, color }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const newCol = {
      id: 'col-' + Date.now().toString(36),
      title: String(title || 'Новая колонка').trim(),
      color: color || 'indigo',
      description: ''
    };
    room.columns.push(newCol);
    broadcastRoomUpdate(room);
  });

  socket.on('column-delete', ({ columnId }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;
    if (room.columns.length <= 1) return; // Keep at least one column

    room.columns = room.columns.filter(c => c.id !== columnId);
    // Remove or move cards in this column
    room.cards = room.cards.filter(c => c.columnId !== columnId);
    broadcastRoomUpdate(room);
  });

  socket.on('column-rename', ({ columnId, title }) => {
    if (!currentRoomId) return;
    const room = storage.getRoom(currentRoomId);
    if (!room) return;

    const col = room.columns.find(c => c.id === columnId);
    if (col) {
      col.title = String(title).trim();
      broadcastRoomUpdate(room);
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    if (currentRoomId && roomSessions.has(currentRoomId)) {
      const session = roomSessions.get(currentRoomId);
      session.participants.delete(socket.id);
      broadcastParticipants(currentRoomId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Team Retro server running at:`);
  console.log(`   - Local:    http://localhost:${PORT}`);
  console.log(`   - LAN:      http://192.168.2.111:${PORT}`);
  console.log(`   - External: http://185.236.28.55:${PORT}`);
});
