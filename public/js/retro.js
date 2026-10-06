// Collaborative Retrospective Board Frontend Logic

(function() {
  'use strict';

  // State
  let socket = null;
  let currentRoom = null;
  let currentUser = null;
  let stagesList = [];
  let availableTagsList = [];
  let draggedCardId = null;
  let activeReactionCardId = null;
  let activeReactionBubble = null;

  // Extract Room ID from URL path: /retro/:id or /room/:id or search param
  function getRoomIdFromUrl() {
    const path = window.location.pathname;
    let id = '';
    if (path.includes('/retro/')) {
      id = path.split('/retro/')[1];
    } else if (path.includes('/room/')) {
      id = path.split('/room/')[1];
    }
    if (!id) {
      const params = new URLSearchParams(window.location.search);
      id = params.get('id') || params.get('room');
    }
    if (!id || id.trim() === '') {
      id = 'team-sprint';
    }
    return decodeURIComponent(id.split('/')[0].split('?')[0]);
  }

  const roomId = getRoomIdFromUrl();

  // User Profile Management
  function getStoredUser() {
    try {
      const raw = localStorage.getItem('retro_user');
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    const randomAvatars = ['🦊', '🚀', '🐼', '🦁', '🦉', '🦄', '🐱', '🤖'];
    const randomAvatar = randomAvatars[Math.floor(Math.random() * randomAvatars.length)];
    const randomNum = Math.floor(100 + Math.random() * 900);

    const newUser = {
      id: 'usr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      name: 'Участник ' + randomNum,
      avatar: randomAvatar,
      color: '#6366f1'
    };
    saveUser(newUser);
    return newUser;
  }

  function saveUser(user) {
    currentUser = user;
    try {
      localStorage.setItem('retro_user', JSON.stringify(user));
    } catch (e) {}
  }

  currentUser = getStoredUser();

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem('retro_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = saved === 'dark' ? '☀️' : '🌙';

    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('retro_theme', next);
        if (themeIcon) themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
      });
    }
  }

  // Toast Helper
  window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // Dialog Light-Dismiss Helper (Compliant with modern guidance)
  function setupDialogHelpers() {
    document.querySelectorAll('dialog').forEach(dialog => {
      // Close button handling
      dialog.querySelectorAll('[data-close-dialog]').forEach(btn => {
        btn.addEventListener('click', () => dialog.close());
      });

      // Fallback for browsers without closedby support
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (!isContent) {
            dialog.close();
          }
        });
      }
    });
  }

  // Connect Socket.IO
  function initSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('Connected to server via WebSocket');
      socket.emit('join-room', {
        roomId,
        user: currentUser
      });
    });

    socket.on('room-init', (data) => {
      currentRoom = data.room;
      stagesList = data.stages || [];
      availableTagsList = data.availableTags || [];
      updateHeaderUI();
      renderStages();
      renderBoard();
      updateVotesIndicator();
      updateActionItemsBadge();
      updateBlurButtonUI();
    });

    socket.on('room-updated', (room) => {
      currentRoom = room;
      updateHeaderUI();
      renderStages();
      renderBoard();
      updateVotesIndicator();
      updateActionItemsBadge();
      updateBlurButtonUI();

      // If icebreaker dialog is open, update stats
      const iceDialog = document.getElementById('icebreaker-dialog');
      if (iceDialog && iceDialog.open) {
        renderIcebreakerStats();
      }

      // If actions dialog is open, update actions
      const actDialog = document.getElementById('actions-dialog');
      if (actDialog && actDialog.open) {
        renderActionItemsList();
      }
    });

    socket.on('participants-updated', (participants) => {
      renderParticipants(participants);
    });

    socket.on('timer-tick', (timer) => {
      if (currentRoom) currentRoom.timer = timer;
      updateTimerUI(timer);
    });

    socket.on('timer-ended', () => {
      if (window.soundEngine) window.soundEngine.playTimerEnd();
      window.showToast('⏱️ Время этапа истекло!', 'warning');
    });

    socket.on('sound-event', (evt) => {
      if (!window.soundEngine) return;
      if (evt.type === 'card-added') window.soundEngine.playPop();
      if (evt.type === 'vote-added') window.soundEngine.playVote();
      if (evt.type === 'action-added') window.soundEngine.playPop();
    });

    socket.on('confetti-fired', (data) => {
      if (window.confettiLauncher) window.confettiLauncher.fire(160);
      if (window.soundEngine) window.soundEngine.playFanfare();
      window.showToast(`🎉 ${data.senderName || 'Команда'} празднует завершение!`, 'success');
    });

    socket.on('notification', (data) => {
      window.showToast(data.message, data.type || 'info');
    });
  }

  // Header UI Updates
  function updateHeaderUI() {
    if (!currentRoom) return;

    const titleEl = document.getElementById('room-title-display');
    if (titleEl) {
      titleEl.textContent = currentRoom.title || 'Ретроспектива';
      document.title = `${currentRoom.title} — Team Retro`;
    }

    const curAvatar = document.getElementById('current-user-avatar');
    if (curAvatar && currentUser) {
      curAvatar.textContent = currentUser.avatar || '🦊';
    }
  }

  // Participants Pile UI
  function renderParticipants(list) {
    const pile = document.getElementById('participants-pile');
    if (!pile) return;

    pile.innerHTML = '';
    (list || []).forEach(p => {
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'participant-avatar';
      avatarDiv.title = `${p.name} (онлайн)`;
      avatarDiv.innerHTML = `
        <span>${p.avatar || '🦊'}</span>
        <span class="participant-online-dot"></span>
      `;
      pile.appendChild(avatarDiv);
    });
  }

  // Timer UI
  function updateTimerUI(timer) {
    const display = document.getElementById('timer-display');
    const toggleIcon = document.getElementById('timer-toggle-icon');
    if (!display || !timer) return;

    const seconds = timer.remainingSeconds !== undefined ? timer.remainingSeconds : 300;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (toggleIcon) {
      toggleIcon.textContent = timer.running ? '⏸️' : '▶️';
    }

    display.classList.remove('timer-running', 'timer-warning');
    if (timer.running) {
      if (seconds <= 30 && seconds > 0) {
        display.classList.add('timer-warning');
      } else {
        display.classList.add('timer-running');
      }
    }
  }

  // Stepper of Stages
  function renderStages() {
    const stepper = document.getElementById('stages-stepper');
    if (!stepper || !currentRoom) return;

    stepper.innerHTML = '';
    const activeStage = currentRoom.stage || 'icebreaker';

    stagesList.forEach((st, idx) => {
      const btn = document.createElement('button');
      btn.className = `stage-step ${st.id === activeStage ? 'active' : ''}`;
      btn.title = st.description;
      btn.textContent = st.name;

      btn.addEventListener('click', () => {
        socket.emit('change-stage', { stage: st.id });
        if (st.id === 'icebreaker') {
          openIcebreakerDialog();
        } else if (st.id === 'actions') {
          openActionsDialog();
        } else if (st.id === 'summary') {
          openSummaryDialog();
        }
      });

      stepper.appendChild(btn);
    });
  }

  // Blur Toggle Button UI
  function updateBlurButtonUI() {
    if (!currentRoom) return;
    const icon = document.getElementById('blur-btn-icon');
    const text = document.getElementById('blur-btn-text');
    const btn = document.getElementById('btn-toggle-blur');

    if (currentRoom.blurCards) {
      if (icon) icon.textContent = '👁️';
      if (text) text.textContent = 'Открыть карточки';
      if (btn) btn.classList.add('btn-primary');
      if (btn) btn.classList.remove('btn-secondary');
    } else {
      if (icon) icon.textContent = '🙈';
      if (text) text.textContent = 'Скрыть карточки';
      if (btn) btn.classList.remove('btn-primary');
      if (btn) btn.classList.add('btn-secondary');
    }
  }

  // Votes Indicator
  function updateVotesIndicator() {
    if (!currentRoom || !currentUser) return;
    const totalVotesAllowed = currentRoom.votesPerUser || 5;

    let usedVotes = 0;
    (currentRoom.cards || []).forEach(c => {
      if (Array.isArray(c.votes) && c.votes.includes(currentUser.id)) {
        usedVotes += 1;
      }
    });

    const remaining = Math.max(0, totalVotesAllowed - usedVotes);
    const badge = document.getElementById('remaining-votes-count');
    if (badge) {
      badge.textContent = `${remaining} / ${totalVotesAllowed}`;
    }
  }

  // Action Items Badge
  function updateActionItemsBadge() {
    if (!currentRoom) return;
    const badge = document.getElementById('actions-count-badge');
    if (badge) {
      badge.textContent = (currentRoom.actionItems || []).length;
    }
  }

  // Board Rendering
  function renderBoard() {
    const container = document.getElementById('board-columns-container');
    if (!container || !currentRoom) return;

    container.innerHTML = '';
    const columns = currentRoom.columns || [];
    const cards = currentRoom.cards || [];
    const isBlurActive = !!currentRoom.blurCards;

    columns.forEach(col => {
      const colEl = document.createElement('div');
      colEl.className = 'board-column';
      colEl.dataset.columnId = col.id;

      // Filter cards for this column
      const colCards = cards.filter(c => c.columnId === col.id);

      // In voting stage, sort cards by votes descending
      if (currentRoom.stage === 'vote' || currentRoom.stage === 'summary') {
        colCards.sort((a, b) => ((b.votes || []).length) - ((a.votes || []).length));
      }

      // Column Header
      const headerEl = document.createElement('div');
      headerEl.className = `column-header color-${col.color || 'indigo'}`;
      headerEl.innerHTML = `
        <div class="col-header-info">
          <span class="col-title">${escapeHtml(col.title)}</span>
          <span class="col-count-badge">${colCards.length}</span>
        </div>
        <div class="col-actions">
          <button class="col-btn-add" data-add-for-col="${col.id}" title="Добавить карточку">+</button>
        </div>
      `;

      // Quick Add Inline Box
      const quickAddBox = document.createElement('div');
      quickAddBox.className = 'quick-add-box';
      quickAddBox.id = `quick-add-${col.id}`;

      // Build tags pills for quick add
      const tagsHtml = availableTagsList.map(tag => 
        `<span class="tag-checkbox-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
      ).join('');

      quickAddBox.innerHTML = `
        <textarea class="quick-add-textarea" placeholder="Напишите мысль... (Ctrl+Enter для отправки)" rows="2"></textarea>
        <div class="tags-selector" style="margin-bottom: 10px;">${tagsHtml}</div>
        <div class="quick-add-footer">
          <label class="quick-add-anon">
            <input type="checkbox" class="chk-anon">
            <span>🎭 Анонимно</span>
          </label>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm btn-cancel-quick-add">Отмена</button>
            <button class="btn btn-primary btn-sm btn-submit-quick-add">Добавить</button>
          </div>
        </div>
      `;

      // Cards Scroll Area
      const scrollArea = document.createElement('div');
      scrollArea.className = 'cards-scroll-area';
      scrollArea.dataset.columnId = col.id;

      if (colCards.length === 0) {
        scrollArea.innerHTML = `
          <div class="column-empty">
            <span class="column-empty-icon">💭</span>
            <p>Пока нет мыслей в этой колонке</p>
          </div>
        `;
      } else {
        colCards.forEach(card => {
          const cardEl = renderCard(card, isBlurActive);
          scrollArea.appendChild(cardEl);
        });
      }

      // Append column parts
      colEl.appendChild(headerEl);
      colEl.appendChild(quickAddBox);
      colEl.appendChild(scrollArea);
      container.appendChild(colEl);

      // Event Listeners for Quick Add
      const btnAdd = headerEl.querySelector(`[data-add-for-col="${col.id}"]`);
      const textarea = quickAddBox.querySelector('.quick-add-textarea');
      const btnCancel = quickAddBox.querySelector('.btn-cancel-quick-add');
      const btnSubmit = quickAddBox.querySelector('.btn-submit-quick-add');
      const chkAnon = quickAddBox.querySelector('.chk-anon');

      btnAdd.addEventListener('click', () => {
        quickAddBox.classList.toggle('active');
        if (quickAddBox.classList.contains('active')) {
          textarea.focus();
        }
      });

      btnCancel.addEventListener('click', () => {
        quickAddBox.classList.remove('active');
        textarea.value = '';
      });

      // Tags toggling
      quickAddBox.querySelectorAll('.tag-checkbox-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          pill.classList.toggle('selected');
        });
      });

      const handleAddCardSubmit = () => {
        const text = textarea.value.trim();
        if (!text) return;

        const selectedTags = Array.from(quickAddBox.querySelectorAll('.tag-checkbox-pill.selected'))
          .map(el => el.dataset.tag);

        socket.emit('card-add', {
          columnId: col.id,
          text,
          isAnonymous: chkAnon.checked,
          tags: selectedTags,
          color: 'default'
        });

        textarea.value = '';
        quickAddBox.querySelectorAll('.tag-checkbox-pill').forEach(p => p.classList.remove('selected'));
        quickAddBox.classList.remove('active');
      };

      btnSubmit.addEventListener('click', handleAddCardSubmit);

      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleAddCardSubmit();
        }
      });

      // Drag and Drop support on columns
      setupColumnDragAndDrop(colEl, scrollArea, col.id);
    });
  }

  // Render a Single Card
  function renderCard(card, isBlurActive) {
    const cardEl = document.createElement('div');
    cardEl.className = 'retro-card';
    cardEl.dataset.cardId = card.id;
    cardEl.draggable = true;

    // Check blur state
    const isOwner = currentUser && card.authorId === currentUser.id;
    const shouldBlur = isBlurActive && !isOwner;

    if (shouldBlur) {
      cardEl.classList.add('is-blurred');
    }

    // Group Header
    let groupHtml = '';
    if (card.groupId) {
      groupHtml = `
        <div class="card-top-bar">
          <span class="card-group-pill" title="Карточка в группе">
            <span>🗂️ ${escapeHtml(card.groupTitle || 'Группа мыслей')}</span>
          </span>
          <button class="btn-card-menu btn-ungroup" data-card-id="${card.id}" title="Исключить из группы">✕</button>
        </div>
      `;
    }

    // Card Tags
    let tagsHtml = '';
    if (card.tags && card.tags.length > 0) {
      tagsHtml = `<div class="card-tags">${card.tags.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }

    // Voting state
    const votesCount = (card.votes || []).length;
    const hasVoted = currentUser && (card.votes || []).includes(currentUser.id);

    // Reactions bar
    let reactionsHtml = '';
    if (card.reactions && Object.keys(card.reactions).length > 0) {
      reactionsHtml = '<div class="reactions-bar">';
      for (const [emoji, users] of Object.entries(card.reactions)) {
        if (users.length > 0) {
          const isActive = currentUser && users.includes(currentUser.id);
          reactionsHtml += `
            <span class="reaction-pill ${isActive ? 'active' : ''}" data-card-id="${card.id}" data-emoji="${emoji}">
              <span>${emoji}</span>
              <span style="font-weight: 700; margin-left: 2px;">${users.length}</span>
            </span>
          `;
        }
      }
      reactionsHtml += '</div>';
    }

    const authorDisplay = card.isAnonymous ? 'Анонимно' : escapeHtml(card.authorName || 'Участник');
    const authorAvatar = card.isAnonymous ? '🎭' : (card.authorAvatar || '🦊');

    cardEl.innerHTML = `
      ${groupHtml}
      <div class="card-text">${shouldBlur ? '••••••••••••••••••••••••••••' : escapeHtml(card.text)}</div>
      ${shouldBlur ? '<div class="card-blur-notice"><span>🔒 Скрыто до открытия фасилитатором</span></div>' : ''}
      ${tagsHtml}
      ${reactionsHtml}
      <div class="card-footer">
        <div class="card-author">
          <span class="card-author-avatar">${authorAvatar}</span>
          <span>${authorDisplay}</span>
        </div>
        <div class="card-interact">
          <button class="btn-vote ${hasVoted ? 'has-voted' : ''}" data-card-id="${card.id}" title="Отдать или снять голос">
            <span>👍</span>
            <span>${votesCount}</span>
          </button>
          <button class="btn-add-reaction" data-card-id="${card.id}" title="Добавить реакцию">+</button>
          <button class="btn-card-menu btn-edit-card" data-card-id="${card.id}" title="Опции карточки">•••</button>
        </div>
      </div>
    `;

    // Card Drag events
    cardEl.addEventListener('dragstart', (e) => {
      draggedCardId = card.id;
      cardEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    cardEl.addEventListener('dragend', () => {
      draggedCardId = null;
      cardEl.classList.remove('dragging');
      document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    // Drop onto this card to group!
    cardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedCardId && draggedCardId !== card.id) {
        cardEl.classList.add('drag-target');
      }
    });

    cardEl.addEventListener('dragleave', () => {
      cardEl.classList.remove('drag-target');
    });

    cardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cardEl.classList.remove('drag-target');

      if (draggedCardId && draggedCardId !== card.id) {
        openGroupCardsDialog(draggedCardId, card.id);
      }
    });

    // Vote button event
    const btnVote = cardEl.querySelector('.btn-vote');
    if (btnVote) {
      btnVote.addEventListener('click', () => {
        socket.emit('card-vote', { cardId: card.id });
      });
    }

    // Reaction pills click
    cardEl.querySelectorAll('.reaction-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const emoji = pill.dataset.emoji;
        socket.emit('card-reaction', { cardId: card.id, emoji });
      });
    });

    // Add Reaction Button (+)
    const btnReact = cardEl.querySelector('.btn-add-reaction');
    if (btnReact) {
      btnReact.addEventListener('click', (e) => {
        e.stopPropagation();
        showEmojiPicker(btnReact, card.id);
      });
    }

    // Edit card button
    const btnEdit = cardEl.querySelector('.btn-edit-card');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => {
        openEditCardDialog(card);
      });
    }

    // Ungroup button
    const btnUngroup = cardEl.querySelector('.btn-ungroup');
    if (btnUngroup) {
      btnUngroup.addEventListener('click', () => {
        socket.emit('card-ungroup', { cardId: card.id });
      });
    }

    return cardEl;
  }

  // Drag & Drop Setup for Columns
  function setupColumnDragAndDrop(columnEl, scrollArea, columnId) {
    columnEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      columnEl.classList.add('drag-over');
    });

    columnEl.addEventListener('dragleave', (e) => {
      if (!columnEl.contains(e.relatedTarget)) {
        columnEl.classList.remove('drag-over');
      }
    });

    columnEl.addEventListener('drop', (e) => {
      e.preventDefault();
      columnEl.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('text/plain') || draggedCardId;

      if (cardId) {
        socket.emit('card-move', {
          cardId,
          targetColumnId: columnId
        });
      }
    });
  }

  // Emoji Reactions Picker Bubble
  function showEmojiPicker(targetBtn, cardId) {
    closeEmojiPicker();

    const bubble = document.createElement('div');
    bubble.className = 'emoji-picker-bubble';
    activeReactionCardId = cardId;
    activeReactionBubble = bubble;

    const emojis = ['👍', '❤️', '🚀', '💡', '🔥', '👏', '🎯', '👀'];
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('card-reaction', { cardId, emoji });
        closeEmojiPicker();
      });
      bubble.appendChild(btn);
    });

    document.body.appendChild(bubble);

    const rect = targetBtn.getBoundingClientRect();
    bubble.style.top = `${rect.top - 46 + window.scrollY}px`;
    bubble.style.left = `${Math.max(10, rect.left - 60)}px`;

    // Click outside listener
    setTimeout(() => {
      const handleOutsideClick = (e) => {
        if (!bubble.contains(e.target)) {
          closeEmojiPicker();
          document.removeEventListener('click', handleOutsideClick);
        }
      };
      document.addEventListener('click', handleOutsideClick);
    }, 10);
  }

  function closeEmojiPicker() {
    if (activeReactionBubble) {
      activeReactionBubble.remove();
      activeReactionBubble = null;
      activeReactionCardId = null;
    }
  }

  // Dialog: Edit Card
  function openEditCardDialog(card) {
    const dialog = document.getElementById('edit-card-dialog');
    const idInput = document.getElementById('edit-card-id');
    const textInput = document.getElementById('edit-card-text');
    const tagsContainer = document.getElementById('edit-card-tags');

    idInput.value = card.id;
    textInput.value = card.text;

    tagsContainer.innerHTML = '';
    availableTagsList.forEach(t => {
      const pill = document.createElement('span');
      const isSelected = (card.tags || []).includes(t);
      pill.className = `tag-checkbox-pill ${isSelected ? 'selected' : ''}`;
      pill.dataset.tag = t;
      pill.textContent = t;
      pill.addEventListener('click', () => pill.classList.toggle('selected'));
      tagsContainer.appendChild(pill);
    });

    dialog.showModal();
  }

  // Dialog: Group Cards
  function openGroupCardsDialog(sourceCardId, targetCardId) {
    const dialog = document.getElementById('group-card-dialog');
    document.getElementById('group-source-card-id').value = sourceCardId;
    document.getElementById('group-target-card-id').value = targetCardId;
    document.getElementById('group-title-input').value = '';
    dialog.showModal();
  }

  // Dialog: Icebreaker / Mood
  function openIcebreakerDialog() {
    const dialog = document.getElementById('icebreaker-dialog');
    if (!dialog) return;

    renderIcebreakerStats();
    dialog.showModal();
  }

  function renderIcebreakerStats() {
    if (!currentRoom || !currentRoom.icebreaker) return;

    const answersObj = currentRoom.icebreaker.answers || {};
    const answers = Object.values(answersObj);

    const avgEl = document.getElementById('mood-avg-score');
    const countEl = document.getElementById('mood-responses-count');
    const listEl = document.getElementById('mood-answers-list');

    if (answers.length === 0) {
      avgEl.textContent = '—';
      countEl.textContent = '0';
      listEl.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 12px; font-size: 0.9rem;">
          Никто еще не ответил. Будьте первыми! 🚀
        </div>
      `;
      return;
    }

    const sum = answers.reduce((acc, a) => acc + (a.mood || 0), 0);
    const avg = (sum / answers.length).toFixed(1);

    avgEl.textContent = avg;
    countEl.textContent = answers.length;

    listEl.innerHTML = '';
    answers.forEach(a => {
      const card = document.createElement('div');
      card.className = 'mood-answer-card';
      card.innerHTML = `
        <span style="font-size: 1.8rem;">${a.emoji || '🙂'}</span>
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.9rem;">${escapeHtml(a.userName || 'Участник')}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(a.note || 'Без комментария')}</div>
        </div>
        <span class="col-pill" style="font-weight: 700;">${a.mood} / 5</span>
      `;
      listEl.appendChild(card);
    });
  }

  // Dialog: Action Items
  function openActionsDialog() {
    const dialog = document.getElementById('actions-dialog');
    if (!dialog) return;

    renderActionItemsList();
    dialog.showModal();
  }

  function renderActionItemsList() {
    if (!currentRoom) return;
    const listEl = document.getElementById('action-items-list');
    if (!listEl) return;

    const items = currentRoom.actionItems || [];
    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.9rem;">
          Пока нет зафиксированных договоренностей. Добавьте первую сверху! 🎯
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `action-item-row ${item.completed ? 'completed' : ''}`;

      const assigneeBadge = item.assignee ? `<span class="action-assignee-badge">👤 @${escapeHtml(item.assignee)}</span>` : '';
      const dueBadge = item.dueDate ? `<span class="action-due-badge">📅 до ${item.dueDate}</span>` : '';

      row.innerHTML = `
        <div class="action-item-left">
          <input type="checkbox" class="action-checkbox" ${item.completed ? 'checked' : ''} data-action-id="${item.id}">
          <div>
            <div class="action-item-text">${escapeHtml(item.text)}</div>
            <div class="action-meta">${assigneeBadge} ${dueBadge}</div>
          </div>
        </div>
        <button class="btn-card-menu btn-delete-action" data-action-id="${item.id}" title="Удалить задачу">🗑️</button>
      `;

      const chk = row.querySelector('.action-checkbox');
      chk.addEventListener('change', () => {
        socket.emit('action-toggle', { actionId: item.id });
      });

      const btnDel = row.querySelector('.btn-delete-action');
      btnDel.addEventListener('click', () => {
        socket.emit('action-delete', { actionId: item.id });
      });

      listEl.appendChild(row);
    });
  }

  // Dialog: Summary & Analytics
  function openSummaryDialog() {
    const dialog = document.getElementById('summary-dialog');
    if (!dialog || !currentRoom) return;

    const cards = currentRoom.cards || [];
    const totalVotes = cards.reduce((sum, c) => sum + (c.votes || []).length, 0);
    const actions = currentRoom.actionItems || [];
    const iceAnswers = Object.values((currentRoom.icebreaker && currentRoom.icebreaker.answers) || {});

    document.getElementById('sum-cards-count').textContent = cards.length;
    document.getElementById('sum-votes-count').textContent = totalVotes;
    document.getElementById('sum-actions-count').textContent = actions.length;

    if (iceAnswers.length > 0) {
      const avg = (iceAnswers.reduce((acc, a) => acc + (a.mood || 0), 0) / iceAnswers.length).toFixed(1);
      document.getElementById('sum-mood-avg').textContent = `${avg} / 5`;
    } else {
      document.getElementById('sum-mood-avg').textContent = '—';
    }

    const md = window.RetroExporter.generateMarkdown(currentRoom);
    document.getElementById('summary-markdown-preview').textContent = md;

    dialog.showModal();
  }

  // Setup Event Listeners
  function initEventListeners() {
    // Edit Title
    const btnEditTitle = document.getElementById('btn-edit-title');
    if (btnEditTitle) {
      btnEditTitle.addEventListener('click', () => {
        const newTitle = prompt('Введите новое название ретроспективы:', currentRoom ? currentRoom.title : '');
        if (newTitle && newTitle.trim()) {
          socket.emit('update-room-title', { title: newTitle.trim() });
        }
      });
    }

    // Timer Controls
    const btnTimerToggle = document.getElementById('btn-timer-toggle');
    if (btnTimerToggle) {
      btnTimerToggle.addEventListener('click', () => {
        if (!currentRoom || !currentRoom.timer) return;
        if (currentRoom.timer.running) {
          socket.emit('timer-pause');
        } else {
          socket.emit('timer-start', { durationSeconds: currentRoom.timer.remainingSeconds || 300 });
        }
      });
    }

    const btnTimerAdd = document.getElementById('btn-timer-add');
    if (btnTimerAdd) {
      btnTimerAdd.addEventListener('click', () => {
        if (!currentRoom || !currentRoom.timer) return;
        const remaining = (currentRoom.timer.remainingSeconds || 0) + 60;
        socket.emit('timer-start', { durationSeconds: remaining });
        window.showToast('Добавлена 1 минута к таймеру', 'info');
      });
    }

    const btnTimerReset = document.getElementById('btn-timer-reset');
    if (btnTimerReset) {
      btnTimerReset.addEventListener('click', () => {
        socket.emit('timer-reset', { durationSeconds: 300 });
      });
    }

    // Keyboard shortcut: Space toggles timer (if not typing in input)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (btnTimerToggle) btnTimerToggle.click();
      }
    });

    // Share Room Button
    const btnShare = document.getElementById('btn-share-room');
    if (btnShare) {
      btnShare.addEventListener('click', () => {
        const url = window.location.href;
        window.RetroExporter.copyToClipboard(url, 'Ссылка на ретро скопирована! Отправьте её команде 🚀');
      });
    }

    // Blur Cards Toggle
    const btnBlur = document.getElementById('btn-toggle-blur');
    if (btnBlur) {
      btnBlur.addEventListener('click', () => {
        if (!currentRoom) return;
        socket.emit('toggle-blur', { blurCards: !currentRoom.blurCards });
      });
    }

    // Open Action Items
    const btnOpenActions = document.getElementById('btn-open-actions');
    if (btnOpenActions) {
      btnOpenActions.addEventListener('click', openActionsDialog);
    }

    // Open Summary
    const btnOpenSummary = document.getElementById('btn-open-summary');
    if (btnOpenSummary) {
      btnOpenSummary.addEventListener('click', openSummaryDialog);
    }

    // Open Icebreaker
    const btnOpenIce = document.getElementById('btn-open-icebreaker');
    if (btnOpenIce) {
      btnOpenIce.addEventListener('click', openIcebreakerDialog);
    }

    // Confetti broadcast
    const btnConfetti = document.getElementById('btn-confetti');
    if (btnConfetti) {
      btnConfetti.addEventListener('click', () => {
        socket.emit('trigger-confetti');
      });
    }

    // Sound toggle
    const btnSound = document.getElementById('btn-sound-toggle');
    const soundIcon = document.getElementById('sound-icon');
    if (btnSound && soundIcon) {
      btnSound.addEventListener('click', () => {
        const isEnabled = window.soundEngine.toggle();
        soundIcon.textContent = isEnabled ? '🔔' : '🔕';
        window.showToast(isEnabled ? 'Звук включен' : 'Звук выключен', 'info');
      });
      soundIcon.textContent = window.soundEngine.enabled ? '🔔' : '🔕';
    }

    // User Profile
    const btnProfile = document.getElementById('btn-user-profile');
    const profileDialog = document.getElementById('profile-dialog');
    const nameInput = document.getElementById('profile-name-input');
    const btnSaveProfile = document.getElementById('btn-save-profile');

    if (btnProfile && profileDialog) {
      btnProfile.addEventListener('click', () => {
        nameInput.value = currentUser.name;
        document.querySelectorAll('.avatar-choice').forEach(choice => {
          choice.classList.toggle('selected', choice.dataset.avatar === currentUser.avatar);
        });
        profileDialog.showModal();
      });

      document.querySelectorAll('.avatar-choice').forEach(choice => {
        choice.addEventListener('click', () => {
          document.querySelectorAll('.avatar-choice').forEach(c => c.classList.remove('selected'));
          choice.classList.add('selected');
        });
      });

      btnSaveProfile.addEventListener('click', () => {
        const newName = nameInput.value.trim();
        const selectedAvatar = document.querySelector('.avatar-choice.selected')?.dataset.avatar || '🦊';
        if (newName) {
          currentUser.name = newName;
          currentUser.avatar = selectedAvatar;
          saveUser(currentUser);
          socket.emit('join-room', { roomId, user: currentUser });
          updateHeaderUI();
          profileDialog.close();
          window.showToast('Профиль сохранен', 'success');
        }
      });
    }

    // Add Column Dialog
    const btnAddCol = document.getElementById('btn-add-column');
    const addColDialog = document.getElementById('add-column-dialog');
    const btnConfirmCol = document.getElementById('btn-confirm-add-column');

    if (btnAddCol && addColDialog) {
      btnAddCol.addEventListener('click', () => {
        document.getElementById('new-col-title').value = '';
        addColDialog.showModal();
      });

      btnConfirmCol.addEventListener('click', () => {
        const title = document.getElementById('new-col-title').value.trim();
        const color = document.getElementById('new-col-color').value;
        if (title) {
          socket.emit('column-add', { title, color });
          addColDialog.close();
        }
      });
    }

    // Submit Icebreaker Mood
    let selectedMood = 3;
    let selectedMoodEmoji = '😐';

    document.querySelectorAll('.mood-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedMood = Number(opt.dataset.mood);
        selectedMoodEmoji = opt.dataset.emoji;
      });
    });

    const btnSubmitIce = document.getElementById('btn-submit-icebreaker');
    if (btnSubmitIce) {
      btnSubmitIce.addEventListener('click', () => {
        const note = document.getElementById('icebreaker-note').value;
        socket.emit('submit-icebreaker', {
          mood: selectedMood,
          emoji: selectedMoodEmoji,
          note
        });
        window.showToast('Спасибо за оценку настроения!', 'success');
      });
    }

    // Add Action Item Form
    const actionForm = document.getElementById('add-action-form');
    if (actionForm) {
      actionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = document.getElementById('action-text-input').value.trim();
        const assignee = document.getElementById('action-assignee-input').value.trim();
        const dueDate = document.getElementById('action-due-input').value;

        if (text) {
          socket.emit('action-add', { text, assignee, dueDate });
          document.getElementById('action-text-input').value = '';
          document.getElementById('action-assignee-input').value = '';
          document.getElementById('action-due-input').value = '';
        }
      });
    }

    // Save Card Edits
    const btnSaveCard = document.getElementById('btn-save-card');
    const editCardDialog = document.getElementById('edit-card-dialog');
    if (btnSaveCard) {
      btnSaveCard.addEventListener('click', () => {
        const cardId = document.getElementById('edit-card-id').value;
        const text = document.getElementById('edit-card-text').value.trim();
        const tags = Array.from(document.querySelectorAll('#edit-card-tags .tag-checkbox-pill.selected'))
          .map(el => el.dataset.tag);

        if (text && cardId) {
          socket.emit('card-edit', { cardId, text, tags });
          editCardDialog.close();
        }
      });
    }

    // Delete Card
    const btnDeleteCard = document.getElementById('btn-delete-card');
    if (btnDeleteCard) {
      btnDeleteCard.addEventListener('click', () => {
        const cardId = document.getElementById('edit-card-id').value;
        if (cardId && confirm('Удалить эту карточку?')) {
          socket.emit('card-delete', { cardId });
          editCardDialog.close();
        }
      });
    }

    // Confirm Group Cards
    const btnConfirmGroup = document.getElementById('btn-confirm-group-cards');
    const groupDialog = document.getElementById('group-card-dialog');
    if (btnConfirmGroup) {
      btnConfirmGroup.addEventListener('click', () => {
        const sourceCardId = document.getElementById('group-source-card-id').value;
        const targetCardId = document.getElementById('group-target-card-id').value;
        const groupTitle = document.getElementById('group-title-input').value.trim();

        if (sourceCardId && targetCardId) {
          socket.emit('card-group', {
            sourceCardId,
            targetCardId,
            groupTitle: groupTitle || 'Общая тема'
          });
          groupDialog.close();
        }
      });
    }

    // Summary Export Buttons
    const btnCopyMd = document.getElementById('btn-copy-md');
    if (btnCopyMd) {
      btnCopyMd.addEventListener('click', () => {
        if (!currentRoom) return;
        const md = window.RetroExporter.generateMarkdown(currentRoom);
        window.RetroExporter.copyToClipboard(md, 'Markdown отчет скопирован в буфер обмена!');
      });
    }

    const btnCopyJira = document.getElementById('btn-copy-jira');
    if (btnCopyJira) {
      btnCopyJira.addEventListener('click', () => {
        if (!currentRoom) return;
        const jira = window.RetroExporter.generateJira(currentRoom);
        window.RetroExporter.copyToClipboard(jira, 'Отчет для Jira / Confluence скопирован!');
      });
    }

    const btnDownloadMd = document.getElementById('btn-download-md');
    if (btnDownloadMd) {
      btnDownloadMd.addEventListener('click', () => {
        if (!currentRoom) return;
        const md = window.RetroExporter.generateMarkdown(currentRoom);
        window.RetroExporter.downloadFile(md, `retro-${currentRoom.id}.md`, 'text/markdown');
      });
    }

    const btnDownloadCsv = document.getElementById('btn-download-csv');
    if (btnDownloadCsv) {
      btnDownloadCsv.addEventListener('click', () => {
        if (!currentRoom) return;
        window.open(`/api/rooms/${currentRoom.id}/export/csv`, '_blank');
      });
    }

    const btnFinishCelebrate = document.getElementById('btn-finish-retro-celebrate');
    if (btnFinishCelebrate) {
      btnFinishCelebrate.addEventListener('click', () => {
        socket.emit('trigger-confetti');
        document.getElementById('summary-dialog').close();
      });
    }
  }

  // Helper: HTML escaping
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupDialogHelpers();
    initEventListeners();
    initSocket();
  });

})();
