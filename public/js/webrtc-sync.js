// WebRTC Peer-to-Peer Synchronization Engine for Team Retro (zero backend required)

(function(window) {
  'use strict';

  const DEFAULT_STAGES = [
    { id: 'icebreaker', name: '1. Настроение', icon: 'smile', description: 'Опрос пульса команды перед стартом' },
    { id: 'brainstorm', name: '2. Сбор идей', icon: 'edit', description: 'Индивидуальная генерация карточек' },
    { id: 'group', name: '3. Группировка', icon: 'layers', description: 'Объединение похожих карточек по темам' },
    { id: 'vote', name: '4. Голосование', icon: 'check-circle', description: 'Выбор ключевых вопросов для обсуждения' },
    { id: 'actions', name: '5. План действий', icon: 'list', description: 'Фиксация конкретных договоренностей' },
    { id: 'summary', name: '6. Итоги', icon: 'award', description: 'Аналитика, празднование и экспорт' }
  ];

  const DEFAULT_TAGS = [
    'Процессы',
    'Команда',
    'Техдолг',
    'Инструменты',
    'Коммуникация',
    'Качество / QA',
    'Продукт',
    'Планирование'
  ];

  const DEFAULT_TEMPLATES = {
    classic: [
      { id: 'went-well', title: 'Что было хорошо 🎉', color: 'emerald' },
      { id: 'to-improve', title: 'Что пошло не так ⚠️', color: 'rose' },
      { id: 'ideas', title: 'Что улучшить 💡', color: 'amber' },
      { id: 'kudos', title: 'Благодарности & Успехи 💖', color: 'indigo' }
    ]
  };

  class WebRtcRetroSync {
    constructor(roomId, currentUser) {
      this.roomId = String(roomId || 'retro-default').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32);
      this.currentUser = currentUser;
      this.isHost = false;
      this.peer = null;
      this.hostConn = null;
      this.connections = new Map(); // peerId -> { conn, user }
      this.listeners = new Map();
      this.timerInterval = null;
      this.room = null;

      this.hostPeerId = `tr2-room-${this.roomId}-host`;
    }

    // Public event dispatcher API (matches Socket.IO)
    on(event, handler) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(handler);
    }

    trigger(event, payload) {
      const handlers = this.listeners.get(event) || [];
      handlers.forEach(h => {
        try { h(payload); } catch (e) { console.error('Handler error:', e); }
      });
    }

    emit(event, payload) {
      if (this.isHost) {
        this.handleHostAction(event, payload, this.currentUser.id);
      } else if (this.hostConn && this.hostConn.open) {
        this.hostConn.send({ event, payload });
      }
    }

    // Initialize connection: try host first, then client
    connect() {
      if (typeof Peer === 'undefined') {
        console.error('PeerJS not loaded');
        this.trigger('notification', { type: 'error', message: 'Библиотека WebRTC (PeerJS) не загружена' });
        return;
      }

      this.tryBecomeHost();
    }

    tryBecomeHost() {
      console.log('🌐 WebRTC: Attempting to claim host role:', this.hostPeerId);
      this.peer = new Peer(this.hostPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('👑 WebRTC: We are the ROOM HOST! Peer ID:', id);
        this.isHost = true;
        this.initHostRoom();
        this.setupHostListeners();
        this.updateConnectionStatusUI('👑 P2P Хост (Онлайн)');
      });

      this.peer.on('error', (err) => {
        console.log('ℹ️ Host ID unavailable or error:', err.type);
        if (err.type === 'unavailable-id') {
          // A host already exists, connect as client!
          this.peer.destroy();
          this.connectAsClient();
        } else {
          console.error('Peer error:', err);
        }
      });
    }

    connectAsClient() {
      console.log('🌐 WebRTC: Connecting as room participant...');
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (myId) => {
        console.log('🙋 WebRTC: Client peer ready, ID:', myId);
        this.hostConn = this.peer.connect(this.hostPeerId, { reliable: true });

        this.hostConn.on('open', () => {
          console.log('🔗 WebRTC: Connected to Room Host!');
          this.updateConnectionStatusUI('🟢 P2P Подключен');
          this.hostConn.send({
            event: 'join-room',
            payload: {
              roomId: this.roomId,
              user: this.currentUser
            }
          });
        });

        this.hostConn.on('data', (msg) => {
          if (msg && msg.event) {
            this.trigger(msg.event, msg.payload);
          }
        });

        this.hostConn.on('close', () => {
          console.warn('⚠️ WebRTC: Host disconnected. Attempting host takeover...');
          this.updateConnectionStatusUI('🟡 Переподключение P2P...');
          setTimeout(() => this.tryBecomeHost(), 1500);
        });

        this.hostConn.on('error', (err) => {
          console.error('Host connection error:', err);
          setTimeout(() => this.tryBecomeHost(), 2000);
        });
      });
    }

    // Host Room State Management
    initHostRoom() {
      const storageKey = `webrtc_room_${this.roomId}`;
      let room = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) room = JSON.parse(raw);
      } catch (e) {}

      if (!room) {
        room = {
          id: this.roomId,
          title: 'Ретроспектива ' + this.roomId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          template: 'classic',
          stage: 'icebreaker',
          blurCards: false,
          votesPerUser: 5,
          columns: DEFAULT_TEMPLATES.classic.map(c => ({ ...c })),
          cards: [],
          actionItems: [],
          icebreaker: {
            question: 'Как прошёл этот спринт? Оцените общее самочувствие и результат команды:',
            answers: {}
          },
          timer: {
            running: false,
            durationSeconds: 300,
            remainingSeconds: 300,
            endsAt: null
          }
        };
      }

      this.room = room;
      this.saveRoomState();

      // Send initial room-init to self
      this.trigger('room-init', {
        room: this.room,
        user: this.currentUser,
        stages: DEFAULT_STAGES,
        availableTags: DEFAULT_TAGS
      });

      this.broadcastParticipants();
    }

    saveRoomState() {
      if (!this.room) return;
      this.room.updatedAt = Date.now();
      try {
        localStorage.setItem(`webrtc_room_${this.roomId}`, JSON.stringify(this.room));
      } catch (e) {}
    }

    setupHostListeners() {
      this.peer.on('connection', (conn) => {
        let peerUser = null;

        conn.on('data', (msg) => {
          if (!msg || !msg.event) return;

          if (msg.event === 'join-room') {
            peerUser = msg.payload.user;
            this.connections.set(conn.peer, { conn, user: peerUser });
            console.log(`👤 Participant joined P2P: ${peerUser.name} (${conn.peer})`);

            // Send full room state
            conn.send({
              event: 'room-init',
              payload: {
                room: this.room,
                user: peerUser,
                stages: DEFAULT_STAGES,
                availableTags: DEFAULT_TAGS
              }
            });

            this.broadcastParticipants();
          } else {
            this.handleHostAction(msg.event, msg.payload, peerUser ? peerUser.id : null);
          }
        });

        conn.on('close', () => {
          this.connections.delete(conn.peer);
          this.broadcastParticipants();
        });

        conn.on('error', () => {
          this.connections.delete(conn.peer);
          this.broadcastParticipants();
        });
      });
    }

    broadcast(event, payload) {
      // Trigger locally on host
      this.trigger(event, payload);

      // Send to all connected client peers
      const message = { event, payload };
      this.connections.forEach(({ conn }) => {
        if (conn.open) {
          try { conn.send(message); } catch (e) {}
        }
      });
    }

    broadcastParticipants() {
      const list = [{
        id: this.currentUser.id,
        name: this.currentUser.name + ' (Хост)',
        avatar: this.currentUser.avatar,
        color: this.currentUser.color
      }];

      this.connections.forEach(({ user }) => {
        if (user) list.push(user);
      });

      this.broadcast('participants-updated', list);
    }

    // Host Action Handling
    handleHostAction(action, payload, senderId) {
      const r = this.room;
      if (!r) return;

      switch (action) {
        case 'submit-icebreaker': {
          if (!r.icebreaker) r.icebreaker = { question: '', answers: {} };
          if (!r.icebreaker.answers) r.icebreaker.answers = {};
          r.icebreaker.answers[payload.userId || senderId || this.currentUser.id] = {
            userId: payload.userId || senderId || this.currentUser.id,
            userName: payload.userName || 'Участник',
            avatar: payload.avatar || '🦊',
            mood: payload.mood || 3,
            emoji: payload.emoji || '🙂',
            note: payload.note || ''
          };
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'card-add': {
          const card = {
            id: 'card-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            columnId: payload.columnId,
            text: payload.text,
            authorId: senderId || this.currentUser.id,
            authorName: payload.isAnonymous ? 'Аноним' : (payload.authorName || this.currentUser.name),
            authorAvatar: payload.isAnonymous ? '🎭' : (payload.authorAvatar || this.currentUser.avatar),
            isAnonymous: !!payload.isAnonymous,
            tags: payload.tags || [],
            color: payload.color || 'default',
            votes: [],
            reactions: {},
            groupId: null,
            createdAt: Date.now()
          };
          r.cards.push(card);
          this.saveRoomState();
          this.broadcast('room-updated', r);
          this.broadcast('sound-event', { type: 'card-added' });
          break;
        }

        case 'card-edit': {
          const card = r.cards.find(c => c.id === payload.cardId);
          if (card) {
            if (payload.text !== undefined) card.text = payload.text;
            if (payload.tags !== undefined) card.tags = payload.tags;
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'card-delete': {
          r.cards = r.cards.filter(c => c.id !== payload.cardId);
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'card-move': {
          const idx = r.cards.findIndex(c => c.id === payload.cardId);
          if (idx !== -1) {
            const [card] = r.cards.splice(idx, 1);
            card.columnId = payload.targetColumnId;
            r.cards.push(card);
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'card-vote': {
          const card = r.cards.find(c => c.id === payload.cardId);
          const userId = senderId || this.currentUser.id;
          if (card) {
            if (!Array.isArray(card.votes)) card.votes = [];
            const vIdx = card.votes.indexOf(userId);
            if (vIdx !== -1) {
              card.votes.splice(vIdx, 1);
            } else {
              const maxVotes = r.votesPerUser || 5;
              const userTotalVotes = r.cards.reduce((sum, c) => sum + (Array.isArray(c.votes) && c.votes.includes(userId) ? 1 : 0), 0);
              if (userTotalVotes >= maxVotes) {
                return;
              }
              card.votes.push(userId);
              this.broadcast('sound-event', { type: 'vote-added' });
            }
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'card-reaction': {
          const card = r.cards.find(c => c.id === payload.cardId);
          const userId = senderId || this.currentUser.id;
          if (card) {
            if (!card.reactions) card.reactions = {};
            if (!Array.isArray(card.reactions[payload.emoji])) card.reactions[payload.emoji] = [];
            const rIdx = card.reactions[payload.emoji].indexOf(userId);
            if (rIdx !== -1) {
              card.reactions[payload.emoji].splice(rIdx, 1);
              if (card.reactions[payload.emoji].length === 0) delete card.reactions[payload.emoji];
            } else {
              card.reactions[payload.emoji].push(userId);
            }
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'card-group': {
          const sCard = r.cards.find(c => c.id === payload.sourceCardId);
          const tCard = r.cards.find(c => c.id === payload.targetCardId);
          if (sCard && tCard) {
            const gId = tCard.groupId || ('group-' + Date.now().toString(36));
            tCard.groupId = gId;
            sCard.groupId = gId;
            sCard.columnId = tCard.columnId;
            if (payload.groupTitle) {
              tCard.groupTitle = payload.groupTitle;
              sCard.groupTitle = payload.groupTitle;
            }
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'card-ungroup': {
          const card = r.cards.find(c => c.id === payload.cardId);
          if (card) {
            card.groupId = null;
            card.groupTitle = null;
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'action-add': {
          if (!Array.isArray(r.actionItems)) r.actionItems = [];
          r.actionItems.push({
            id: 'act-' + Date.now().toString(36),
            text: payload.text,
            assignee: payload.assignee || '',
            dueDate: payload.dueDate || '',
            completed: false,
            createdAt: Date.now()
          });
          this.saveRoomState();
          this.broadcast('room-updated', r);
          this.broadcast('sound-event', { type: 'action-added' });
          break;
        }

        case 'action-toggle': {
          const act = (r.actionItems || []).find(a => a.id === payload.actionId);
          if (act) {
            act.completed = !act.completed;
            this.saveRoomState();
            this.broadcast('room-updated', r);
          }
          break;
        }

        case 'action-delete': {
          r.actionItems = (r.actionItems || []).filter(a => a.id !== payload.actionId);
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'change-stage': {
          r.stage = payload.stage;
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'toggle-blur': {
          r.blurCards = !r.blurCards;
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'update-room-title': {
          r.title = payload.title;
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }

        case 'timer-start': {
          const seconds = payload.durationSeconds || (r.timer.remainingSeconds || 300);
          r.timer.running = true;
          r.timer.durationSeconds = seconds;
          r.timer.remainingSeconds = seconds;
          r.timer.endsAt = Date.now() + seconds * 1000;

          if (this.timerInterval) clearInterval(this.timerInterval);
          this.timerInterval = setInterval(() => {
            const rem = Math.max(0, Math.ceil((r.timer.endsAt - Date.now()) / 1000));
            r.timer.remainingSeconds = rem;
            if (rem <= 0) {
              r.timer.running = false;
              clearInterval(this.timerInterval);
              this.timerInterval = null;
              this.broadcast('timer-tick', r.timer);
              this.broadcast('timer-ended');
            } else {
              this.broadcast('timer-tick', r.timer);
            }
          }, 1000);

          this.saveRoomState();
          this.broadcast('timer-tick', r.timer);
          break;
        }

        case 'timer-pause': {
          r.timer.running = false;
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.timerInterval = null;
          this.saveRoomState();
          this.broadcast('timer-tick', r.timer);
          break;
        }

        case 'timer-reset': {
          r.timer.running = false;
          r.timer.durationSeconds = payload.durationSeconds || 300;
          r.timer.remainingSeconds = payload.durationSeconds || 300;
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.timerInterval = null;
          this.saveRoomState();
          this.broadcast('timer-tick', r.timer);
          break;
        }

        case 'trigger-confetti': {
          this.broadcast('confetti-fired', { senderName: this.currentUser.name });
          break;
        }

        case 'column-add': {
          r.columns.push({
            id: 'col-' + Date.now().toString(36),
            title: payload.title || 'Новая колонка',
            color: payload.color || 'indigo'
          });
          this.saveRoomState();
          this.broadcast('room-updated', r);
          break;
        }
      }
    }

    updateConnectionStatusUI(text) {
      let badge = document.getElementById('webrtc-status-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'webrtc-status-badge';
        badge.style.fontSize = '0.75rem';
        badge.style.padding = '4px 8px';
        badge.style.borderRadius = '9999px';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#10b981';
        badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        badge.style.fontWeight = '600';
        badge.style.marginRight = '8px';

        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
          headerActions.insertBefore(badge, headerActions.firstChild);
        }
      }
      if (badge) {
        badge.textContent = text;
      }
    }
  }

  window.WebRtcRetroSync = WebRtcRetroSync;

})(window);
