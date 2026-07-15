const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { COMMANDS, humanDataLines } = require('./cast');

/** Returns unique plugin command targets exposed by the CLI. */
const cliPluginCommands = () => {
  const cliOnly = new Set(['status', 'install-cli-skill', 'update', 'exec']);
  return new Set(Array.from(COMMANDS.values()).filter((name) => !cliOnly.has(name)));
};

test('exposes variable and style mutation tools directly', () => {
  assert.equal(COMMANDS.get('set-variables'), 'set-variables');
  assert.equal(COMMANDS.get('set-styles'), 'set-styles');
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

test('matches every non-modular plugin tool when the plugin source is available', (context) => {
  const labelsPath = path.resolve(__dirname, '../../cast-builder/plugin/src/shared/tool-labels.json');
  if (!fs.existsSync(labelsPath)) {
    context.skip('Cast plugin source is not installed with the published CLI package');
    return;
  }
  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const pluginCommands = new Set(Object.keys(labels.done).filter((name) => !name.startsWith('create-modular-layouts-')));
  assert.deepEqual(Array.from(cliPluginCommands()).sort(), Array.from(pluginCommands).sort());
});
