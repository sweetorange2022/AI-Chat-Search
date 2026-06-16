const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)');

  const composers = [
    {
      id: 'test-composer-001',
      name: 'How to implement Cursor provider?',
      createdAt: 1717200000000,
      lastUpdatedAt: 1717200120000,
      bubbles: [
        { id: 'bubble-1', type: 1, text: 'How to implement Cursor provider?', createdAt: 1717200000000 },
        { id: 'bubble-2', type: 2, text: 'You can read state.vscdb with sql.js.', createdAt: 1717200060000 },
      ],
    },
    {
      id: 'test-composer-002',
      name: 'Second conversation',
      createdAt: 1717100000000,
      lastUpdatedAt: 1717100060000,
      bubbles: [
        { id: 'bubble-a', type: 1, text: 'Another user question', createdAt: 1717100000000 },
        { id: 'bubble-b', type: 2, text: 'Another assistant reply', createdAt: 1717100060000 },
      ],
    },
  ];

  for (const composer of composers) {
    const composerData = {
      composerId: composer.id,
      name: composer.name,
      createdAt: composer.createdAt,
      lastUpdatedAt: composer.lastUpdatedAt,
      modelConfig: { modelName: 'claude-sonnet-4' },
      fullConversationHeadersOnly: composer.bubbles.map(b => ({
        bubbleId: b.id,
        type: b.type,
      })),
      conversationMap: {},
    };

    db.run('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)', [
      `composerData:${composer.id}`,
      JSON.stringify(composerData),
    ]);

    for (const bubble of composer.bubbles) {
      db.run('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)', [
        `bubbleId:${composer.id}:${bubble.id}`,
        JSON.stringify({
          text: bubble.text,
          type: bubble.type,
          createdAt: bubble.createdAt,
        }),
      ]);
    }
  }

  const data = db.export();
  const fixturePath = path.join(
    __dirname,
    '..',
    'src',
    '__tests__',
    'fixtures',
    'cursor',
    'state.vscdb',
  );
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, Buffer.from(data));
  db.close();
  console.log(`Created fixture at ${fixturePath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
