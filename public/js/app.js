// Landing page application logic

// Theme management
function initTheme() {
  const saved = localStorage.getItem('retro_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('retro_theme', next);
      updateThemeIcon(next);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Toast helper
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

const FALLBACK_TEMPLATES = [
  {
    id: 'classic',
    name: 'Классическое (Went Well / Improve / Ideas)',
    description: 'Идеально для регулярных спринтов: успехи, узкие места и идеи для улучшений',
    columns: [
      { id: 'went-well', title: 'Что было хорошо 🎉', color: 'emerald' },
      { id: 'to-improve', title: 'Что пошло не так ⚠️', color: 'rose' },
      { id: 'ideas', title: 'Что улучшить 💡', color: 'amber' },
      { id: 'kudos', title: 'Благодарности & Успехи 💖', color: 'indigo' }
    ]
  },
  {
    id: 'mad-sad-glad',
    name: 'Mad / Sad / Glad (Эмоциональное ретро)',
    description: 'Фокус на эмоциях и самочувствии команды, снятие напряжения',
    columns: [
      { id: 'mad', title: 'Бесит / Возмущает 😡', color: 'rose' },
      { id: 'sad', title: 'Грустно / Обидно 😢', color: 'indigo' },
      { id: 'glad', title: 'Радует / Вдохновляет 😊', color: 'emerald' }
    ]
  },
  {
    id: 'start-stop-continue',
    name: 'Start / Stop / Continue (Фокус на действиях)',
    description: 'Четкие ориентиры: новые привычки, прекращение лишнего и продолжение лучшего',
    columns: [
      { id: 'start', title: 'Начать делать 🚀', color: 'emerald' },
      { id: 'stop', title: 'Прекратить делать 🛑', color: 'rose' },
      { id: 'continue', title: 'Продолжить делать 🔄', color: 'indigo' }
    ]
  },
  {
    id: 'four-ls',
    name: '4L (Liked / Learned / Lacked / Longed for)',
    description: 'Глубокий анализ спринта или завершенного крупного проекта',
    columns: [
      { id: 'liked', title: 'Liked (Понравилось) ❤️', color: 'rose' },
      { id: 'learned', title: 'Learned (Узнали) 💡', color: 'amber' },
      { id: 'lacked', title: 'Lacked (Не хватило) 🧩', color: 'indigo' },
      { id: 'longed-for', title: 'Longed for (Хотелось бы) 🌟', color: 'emerald' }
    ]
  },
  {
    id: 'sailboat',
    name: 'Парусник (Sailboat Retro)',
    description: 'Метафорическое ретро с обзором курса, ветров, подводных камней и якорей',
    columns: [
      { id: 'wind', title: 'Попутный ветер ⛵', color: 'cyan' },
      { id: 'anchors', title: 'Якори ⚓', color: 'amber' },
      { id: 'rocks', title: 'Подводные рифы 🪨', color: 'rose' },
      { id: 'island', title: 'Остров мечты 🏝️', color: 'emerald' }
    ]
  },
  {
    id: 'daki',
    name: 'DAKI (Drop / Add / Keep / Improve)',
    description: 'Отличный шаблон для очистки процессов и рефакторинга рутины',
    columns: [
      { id: 'drop', title: 'Drop (Выбросить) 🗑️', color: 'rose' },
      { id: 'add', title: 'Add (Добавить) ➕', color: 'emerald' },
      { id: 'keep', title: 'Keep (Сохранить) 📌', color: 'cyan' },
      { id: 'improve', title: 'Improve (Улучшить) 🛠️', color: 'amber' }
    ]
  }
];

// Templates loading
async function loadTemplates() {
  const container = document.getElementById('templates-list');
  if (!container) return;

  let templates = [];
  try {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json();
      templates = data.templates || [];
    }
  } catch (err) {}

  if (!templates || templates.length === 0) {
    templates = FALLBACK_TEMPLATES;
  }

  container.innerHTML = '';
  templates.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = `template-card ${idx === 0 ? 'selected' : ''}`;
    card.dataset.id = t.id;

    const colsPreview = (t.columns || [])
      .map(c => `<span class="col-pill">${c.title}</span>`)
      .join('');

    card.innerHTML = `
      <div class="template-card-title">
        <span>${t.name}</span>
        <span style="font-size: 0.8rem; color: var(--accent-primary);">${t.columns.length} кол.</span>
      </div>
      <div class="template-card-desc">${t.description}</div>
      <div class="template-cols-preview">${colsPreview}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('selected-template').value = t.id;
    });

    container.appendChild(card);
  });
}

// Recent rooms loading
async function loadRecentRooms() {
  const container = document.getElementById('recent-rooms-list');
  if (!container) return;

  let rooms = [];
  try {
    const res = await fetch('/api/rooms');
    if (res.ok) {
      const data = await res.json();
      rooms = data.rooms || [];
    }
  } catch (err) {}

  // Fallback to localStorage rooms
  if (!rooms || rooms.length === 0) {
    try {
      const local = JSON.parse(localStorage.getItem('retro_local_rooms') || '[]');
      if (Array.isArray(local) && local.length > 0) {
        rooms = local;
      }
    } catch (e) {}
  }

  if (rooms.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        У вас пока нет сохраненных ретроспектив. Создайте первую слева! 👈
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  rooms.forEach(r => {
    const item = document.createElement('a');
    item.href = `retro.html?id=${encodeURIComponent(r.id)}`;
    item.className = 'room-item';

    const dateStr = new Date(r.updatedAt || Date.now()).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.95rem;">${r.title}</div>
        <div class="room-meta">
          <span>📅 ${dateStr}</span>
          <span>💬 ${r.cardCount || 0} карточек</span>
          <span>✅ ${r.actionCount || 0} действий</span>
        </div>
      </div>
      <span style="color: var(--accent-primary); font-size: 1.2rem;">→</span>
    `;

    container.appendChild(item);
  });
}

// Form submissions
function initForms() {
  const createForm = document.getElementById('create-room-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('room-title').value.trim();
      const template = document.getElementById('selected-template').value;
      const votesPerUser = document.getElementById('votes-limit').value;

      if (!title) return;

      let createdRoomId = null;
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, template, votesPerUser })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.room) {
            createdRoomId = data.room.id;
          }
        }
      } catch (err) {}

      // If backend was not reached (e.g. GitHub Pages static), create locally
      if (!createdRoomId) {
        createdRoomId = 'retro-' + Date.now().toString(36);
        try {
          const localList = JSON.parse(localStorage.getItem('retro_local_rooms') || '[]');
          localList.unshift({
            id: createdRoomId,
            title,
            template,
            votesPerUser,
            updatedAt: Date.now(),
            cardCount: 0,
            actionCount: 0
          });
          localStorage.setItem('retro_local_rooms', JSON.stringify(localList.slice(0, 20)));
        } catch (e) {}
      }

      window.location.href = `retro.html?id=${encodeURIComponent(createdRoomId)}`;
    });
  }

  const joinForm = document.getElementById('join-room-form');
  if (joinForm) {
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let input = document.getElementById('join-room-input').value.trim();
      if (!input) return;

      // If full URL was pasted, extract room id
      if (input.includes('/retro/')) {
        input = input.split('/retro/')[1];
      } else if (input.includes('/room/')) {
        input = input.split('/room/')[1];
      } else if (input.includes('id=')) {
        input = input.split('id=')[1];
      }
      input = input.split('?')[0].split('#')[0].split('&')[0];

      window.location.href = `retro.html?id=${encodeURIComponent(input)}`;
    });
  }

  const refreshBtn = document.getElementById('refresh-rooms');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadRecentRooms();
      window.showToast('Список обновлен', 'info');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadTemplates();
  loadRecentRooms();
  initForms();
});
