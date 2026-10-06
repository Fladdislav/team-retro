// Retrospective Templates Configuration

const RETRO_TEMPLATES = {
  classic: {
    id: 'classic',
    name: 'Классическое (Went Well / Improve / Ideas)',
    description: 'Идеально для регулярных спринтов: успехи, узкие места и идеи для улучшений',
    columns: [
      { id: 'went-well', title: 'Что было хорошо 🎉', color: 'emerald', description: 'Что сработало круто и чем гордимся' },
      { id: 'to-improve', title: 'Что пошло не так ⚠️', color: 'rose', description: 'Трудности, блокеры и проблемы' },
      { id: 'ideas', title: 'Что улучшить 💡', color: 'amber', description: 'Идеи для оптимизации процессов и кода' },
      { id: 'kudos', title: 'Благодарности & Успехи 💖', color: 'indigo', description: 'Спасибо коллегам за помощь' }
    ]
  },
  'mad-sad-glad': {
    id: 'mad-sad-glad',
    name: 'Mad / Sad / Glad (Эмоциональное ретро)',
    description: 'Фокус на эмоциях и самочувствии команды, снятие напряжения',
    columns: [
      { id: 'mad', title: 'Бесит / Возмущает 😡', color: 'rose', description: 'Что вызывало раздражение или стресс' },
      { id: 'sad', title: 'Грустно / Обидно 😢', color: 'indigo', description: 'Что расстроило или могло быть лучше' },
      { id: 'glad', title: 'Радует / Вдохновляет 😊', color: 'emerald', description: 'Что принесло радость и энергию' }
    ]
  },
  'start-stop-continue': {
    id: 'start-stop-continue',
    name: 'Start / Stop / Continue (Фокус на действиях)',
    description: 'Четкие ориентиры: новые привычки, прекращение лишнего и продолжение лучшего',
    columns: [
      { id: 'start', title: 'Начать делать 🚀', color: 'emerald', description: 'Новые практики, инструменты, привычки' },
      { id: 'stop', title: 'Прекратить делать 🛑', color: 'rose', description: 'Неэффективные процессы и трата времени' },
      { id: 'continue', title: 'Продолжить делать 🔄', color: 'indigo', description: 'То, что работает стабильно и дает плоды' }
    ]
  },
  'four-ls': {
    id: 'four-ls',
    name: '4L (Liked / Learned / Lacked / Longed for)',
    description: 'Глубокий анализ спринта или завершенного крупного проекта',
    columns: [
      { id: 'liked', title: 'Liked (Понравилось) ❤️', color: 'rose', description: 'Любимые моменты и удачные решения' },
      { id: 'learned', title: 'Learned (Узнали) 💡', color: 'amber', description: 'Новые знания, выводы и инсайты' },
      { id: 'lacked', title: 'Lacked (Не хватило) 🧩', color: 'indigo', description: 'Ресурсов, документации, времени, ясности' },
      { id: 'longed-for', title: 'Longed for (Хотелось бы) 🌟', color: 'emerald', description: 'Мечты и пожелания на будущее' }
    ]
  },
  sailboat: {
    id: 'sailboat',
    name: 'Парусник (Sailboat Retro)',
    description: 'Метафорическое ретро с обзором курса, ветров, подводных камней и якорей',
    columns: [
      { id: 'wind', title: 'Попутный ветер ⛵', color: 'cyan', description: 'Что ускоряет наше движение вперед' },
      { id: 'anchors', title: 'Якори ⚓', color: 'amber', description: 'Что тянет нас на дно и тормозит' },
      { id: 'rocks', title: 'Подводные рифы 🪨', color: 'rose', description: 'Скрытые риски и опасности впереди' },
      { id: 'island', title: 'Остров мечты 🏝️', color: 'emerald', description: 'Наши главные цели и светлое будущее' }
    ]
  },
  daki: {
    id: 'daki',
    name: 'DAKI (Drop / Add / Keep / Improve)',
    description: 'Отличный шаблон для очистки процессов и рефакторинга рутины',
    columns: [
      { id: 'drop', title: 'Drop (Выбросить) 🗑️', color: 'rose', description: 'Бесполезные действия и рутина' },
      { id: 'add', title: 'Add (Добавить) ➕', color: 'emerald', description: 'Новые идеи и подходы' },
      { id: 'keep', title: 'Keep (Сохранить) 📌', color: 'cyan', description: 'Ценные привычки и работающие практики' },
      { id: 'improve', title: 'Improve (Улучшить) 🛠️', color: 'amber', description: 'То, что работает, но требует доработки' }
    ]
  }
};

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

module.exports = {
  RETRO_TEMPLATES,
  DEFAULT_STAGES,
  DEFAULT_TAGS
};
