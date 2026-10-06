// Retrospective Export and Summary Helper

const RetroExporter = {
  generateMarkdown(room) {
    let md = `# ${room.title || 'Ретроспектива команды'}\n\n`;
    md += `> **Дата:** ${new Date(room.createdAt || Date.now()).toLocaleDateString('ru-RU')}\n`;
    md += `> **Карточек всего:** ${(room.cards || []).length} | **План действий:** ${(room.actionItems || []).length}\n\n`;

    // Mood Summary
    if (room.icebreaker && Object.keys(room.icebreaker.answers || {}).length > 0) {
      const answers = Object.values(room.icebreaker.answers);
      const avg = (answers.reduce((acc, a) => acc + (a.mood || 0), 0) / answers.length).toFixed(1);
      md += `### 🌡️ Пульс команды (Настроение: ${avg}/5)\n`;
      answers.forEach(a => {
        md += `- ${a.userName || 'Участник'}: ${a.emoji || '🙂'} (${a.mood}/5)${a.note ? ` — "${a.note}"` : ''}\n`;
      });
      md += '\n---\n\n';
    }

    // Top Voted Items
    const cards = [...(room.cards || [])];
    const topCards = cards
      .filter(c => (c.votes || []).length > 0)
      .sort((a, b) => (b.votes || []).length - (a.votes || []).length)
      .slice(0, 5);

    if (topCards.length > 0) {
      md += `### 🔥 Топ тем по итогам голосования\n`;
      topCards.forEach(c => {
        const votes = (c.votes || []).length;
        const col = (room.columns || []).find(col => col.id === c.columnId);
        md += `1. **${c.text}** — 👍 ${votes} голосов *(${col ? col.title : ''})*\n`;
      });
      md += '\n---\n\n';
    }

    // By Column
    md += `### 📋 Все карточки по колонкам\n\n`;
    (room.columns || []).forEach(col => {
      const colCards = cards.filter(c => c.columnId === col.id);
      md += `#### ${col.title} (${colCards.length})\n`;
      if (colCards.length === 0) {
        md += `*Карточек нет*\n\n`;
      } else {
        colCards.sort((a, b) => ((b.votes || []).length) - ((a.votes || []).length));
        colCards.forEach(c => {
          const votes = (c.votes || []).length > 0 ? ` [👍 ${c.votes.length}]` : '';
          const author = c.isAnonymous ? 'Анонимно' : (c.authorName || 'Участник');
          const tags = (c.tags && c.tags.length > 0) ? ` \`${c.tags.join('`, `')}\`` : '';
          md += `- ${c.text}${votes} — *${author}*${tags}\n`;
        });
        md += '\n';
      }
    });

    // Action Items
    md += `---\n\n### ✅ Договоренности и план действий\n\n`;
    if (!room.actionItems || room.actionItems.length === 0) {
      md += `*Действия не зафиксированы*\n`;
    } else {
      room.actionItems.forEach(item => {
        const check = item.completed ? '[x]' : '[ ]';
        const assignee = item.assignee ? ` **Ответственный:** @${item.assignee}` : '';
        const due = item.dueDate ? ` (срок: ${item.dueDate})` : '';
        md += `- ${check} ${item.text}${assignee}${due}\n`;
      });
    }

    return md;
  },

  generateJira(room) {
    let jira = `h1. ${room.title || 'Ретроспектива'}\n\n`;
    (room.columns || []).forEach(col => {
      jira += `h3. ${col.title}\n`;
      const colCards = (room.cards || []).filter(c => c.columnId === col.id);
      colCards.forEach(c => {
        const votes = (c.votes || []).length > 0 ? ` (+${c.votes.length})` : '';
        jira += `* ${c.text}${votes}\n`;
      });
      jira += '\n';
    });

    jira += `h3. Задачи (Action Items)\n`;
    (room.actionItems || []).forEach(a => {
      jira += `# ${a.text} (Ответственный: ${a.assignee || 'Не назначен'}, Срок: ${a.dueDate || '-'})\n`;
    });

    return jira;
  },

  copyToClipboard(text, successMsg = 'Скопировано в буфер обмена!') {
    navigator.clipboard.writeText(text).then(() => {
      if (window.showToast) {
        window.showToast(successMsg, 'success');
      } else {
        alert(successMsg);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  },

  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

window.RetroExporter = RetroExporter;
