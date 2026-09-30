const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { COMMANDS, buildData, humanDataLines } = require('./cast');

/** Returns unique plugin command targets exposed by the CLI. */
const cliPluginCommands = () => {
  const cliOnly = new Set(['status', 'install-cli-skill', 'update', 'exec']);
  return new Set(Array.from(COMMANDS.values()).filter((name) => !cliOnly.has(name)));
};

test('exposes variable and style mutation tools directly', () => {
  assert.equal(COMMANDS.get('set-variables'), 'set-variables');
  assert.equal(COMMANDS.get('set-styles'), 'set-styles');
});

test('exposes personal global instruction tools directly', () => {
  assert.equal(COMMANDS.get('get-global-instructions'), 'get-global-instructions');
  assert.equal(COMMANDS.get('set-global-instructions'), 'set-global-instructions');
  assert.deepEqual(buildData('set-global-instructions', { instructions: '' }), { instructions: '' });
});

test('loads large baked-tool payloads from a data file', () => {
  const payloadPath = path.join(process.cwd(), `.cast-payload-${process.pid}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ svg: '<svg />', payload: { version: 2 } }));
  try {
    assert.deepEqual(buildData('exec', { tool: 'create-modules-design-identity', 'data-file': payloadPath }), {
      tool: 'create-modules-design-identity',
      data: { svg: '<svg />', payload: { version: 2 } },
    });
  } finally {
    fs.unlinkSync(payloadPath);
  }
});

test('prints run-script return values', () => {
  assert.deepEqual(humanDataLines('run-script', { label: 'Read page', result: 'Cover', recall: {} }), ['return: Cover']);
  assert.deepEqual(humanDataLines('run-script', { result: { id: '1:2', value: 0 } }), [
    'return:',
    '{\n  "id": "1:2",\n  "value": 0\n}',
  ]);
});

test('prints wrapped arrays and complete read payloads', () => {
  assert.deepEqual(humanDataLines('list-pages', { result: [{ name: 'Cover', id: '0:1' }], recall: {} }), [
    'data:',
    '[\n  {\n    "name": "Cover",\n    "id": "0:1"\n  }\n]',
  ]);
  assert.deepEqual(humanDataLines('get-skill', { skill: '# File skill', recall: {} }), [
    'data:',
    '{\n  "skill": "# File skill"\n}',
  ]);
});

test('matches every non-domain plugin tool when the plugin source is available', (context) => {
  const labelsPath = path.resolve(__dirname, '../../cast-builder/plugin/src/shared/tool-labels.json');
  if (!fs.existsSync(labelsPath)) {
    context.skip('Cast plugin source is not installed with the published CLI package');
    return;
  }
  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const domainPrefixes = [
    'create-modules-design-',
    'reflow-modules-design-',
    'create-modular-layouts-',
    'reflow-modular-layouts-',
  ];
  const pluginCommands = new Set(
    Object.keys(labels.done).filter((name) => !domainPrefixes.some((prefix) => name.startsWith(prefix)))
  );
  assert.deepEqual(Array.from(cliPluginCommands()).sort(), Array.from(pluginCommands).sort());
});
