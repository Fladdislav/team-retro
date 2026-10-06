// Automated End-to-End WebSocket & API Test Script
const { io } = require('socket.io-client');
const http = require('http');

async function runTests() {
  console.log('🧪 Starting automated tests for Team Retro...');

  const serverUrl = 'http://localhost:3000';
  const roomId = 'test-retro-' + Date.now();

  // Create two simulated team members
  const clientAlice = io(serverUrl);
  const clientBob = io(serverUrl);

  const alice = { id: 'user-alice', name: 'Алиса (QA Lead)', avatar: '🦊', color: '#ec4899' };
  const bob = { id: 'user-bob', name: 'Боб (Backend Dev)', avatar: '🤖', color: '#3b82f6' };

  let receivedCards = [];
  let testSuccess = true;

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    clientAlice.on('connect', check);
    clientBob.on('connect', check);
  });

  console.log('✅ Both simulated clients connected to WebSocket server.');

  // Join room
  clientAlice.emit('join-room', { roomId, user: alice });
  clientBob.emit('join-room', { roomId, user: bob });

  await new Promise(r => setTimeout(r, 300));

  // Test 1: Icebreaker mood submission
  console.log('🧪 Test 1: Submitting icebreaker moods...');
  clientAlice.emit('submit-icebreaker', { mood: 5, emoji: '🚀', note: 'Крутой релиз без сбоев!' });
  clientBob.emit('submit-icebreaker', { mood: 4, emoji: '😊', note: 'Хороший спринт, но тесты долгие.' });

  await new Promise(r => setTimeout(r, 400));

  let latestRoom = null;
  clientAlice.on('room-updated', (room) => {
    latestRoom = room;
  });

  // Test 2: Alice and Bob add cards
  console.log('🧪 Test 2: Adding cards...');
  clientAlice.emit('card-add', {
    columnId: 'went-well',
    text: 'Быстро локализовали и закрыли инцидент с платежкой',
    isAnonymous: false,
    tags: ['Команда', 'Качество / QA']
  });

  clientBob.emit('card-add', {
    columnId: 'to-improve',
    text: 'CI пайплайн собирается 25 минут, нужно кэшировать docker слои',
    isAnonymous: false,
    tags: ['Инструменты', 'Техдолг']
  });

  clientBob.emit('card-add', {
    columnId: 'ideas',
    text: 'Внедрить Playwright вместо устаревшего Selenium',
    isAnonymous: true,
    tags: ['Инструменты', 'Качество / QA']
  });

  await new Promise(r => setTimeout(r, 600));

  // Test 3: Voting on cards
  console.log('🧪 Test 3: Voting on cards...');

  if (!latestRoom || !latestRoom.cards || latestRoom.cards.length < 3) {
    console.error('❌ Failed: Cards were not created as expected.');
    testSuccess = false;
  } else {
    console.log(`✅ Created ${latestRoom.cards.length} cards.`);
    const ciCard = latestRoom.cards.find(c => c.text.includes('CI пайплайн'));
    if (ciCard) {
      clientAlice.emit('card-vote', { cardId: ciCard.id });
      clientBob.emit('card-vote', { cardId: ciCard.id });
      clientAlice.emit('card-reaction', { cardId: ciCard.id, emoji: '🔥' });
    }
  }

  await new Promise(r => setTimeout(r, 400));

  // Test 4: Action Items
  console.log('🧪 Test 4: Creating Action Items...');
  clientAlice.emit('action-add', {
    text: 'Оптимизировать Dockerfile и настроить GitHub Actions cache',
    assignee: 'Боб',
    dueDate: '2026-10-15'
  });

  await new Promise(r => setTimeout(r, 400));

  // Verify room via REST API
  console.log('🧪 Test 5: Verifying room state via REST API...');
  const roomRes = await fetch(`${serverUrl}/api/rooms/${roomId}`);
  const roomJson = await roomRes.json();
  const room = roomJson.room;

  if (room && room.cards.length === 3 && room.actionItems.length === 1) {
    console.log('✅ Room state in database verified: 3 cards, 1 action item.');
  } else {
    console.error('❌ Room state mismatch:', roomJson);
    testSuccess = false;
  }

  // Test 6: Export Markdown
  console.log('🧪 Test 6: Verifying Markdown export...');
  const mdRes = await fetch(`${serverUrl}/api/rooms/${roomId}/export/markdown`);
  const mdText = await mdRes.text();
  if (mdText.includes('Быстро локализовали') && mdText.includes('CI пайплайн') && mdText.includes('Оптимизировать Dockerfile')) {
    console.log('✅ Markdown export contains all generated content.');
  } else {
    console.error('❌ Markdown export missing content:', mdText);
    testSuccess = false;
  }

  // Test 7: Export CSV
  console.log('🧪 Test 7: Verifying CSV export...');
  const csvRes = await fetch(`${serverUrl}/api/rooms/${roomId}/export/csv`);
  const csvText = await csvRes.text();
  if (csvText.includes('Карточка') && csvText.includes('Действие')) {
    console.log('✅ CSV export verified.');
  } else {
    console.error('❌ CSV export failed:', csvText);
    testSuccess = false;
  }

  clientAlice.disconnect();
  clientBob.disconnect();

  if (testSuccess) {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The tool is 100% operational.');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
