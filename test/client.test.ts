import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TpixClient, parseEnvelope } from '../src/tpix/client';
import { TpixError } from '../src/tpix/errors';

const binary = path.join(__dirname, '..', '..', 'bin', process.platform === 'win32' ? 'tpix.exe' : 'tpix');
const hasBinary = fs.existsSync(binary);

/** A client pointed at the real binary but with an isolated config directory. */
function isolatedClient(): TpixClient {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tpix-vscode-test-'));
  return new TpixClient({
    binaryPath: binary,
    env: { ...process.env, XDG_CONFIG_HOME: configHome, HOME: configHome },
  });
}

test('parseEnvelope parses a result document', () => {
  const envelope = parseEnvelope('{"schemaVersion":1,"type":"result","command":"x","data":{"a":1}}');
  assert.equal(envelope?.type, 'result');
  assert.equal(envelope?.command, 'x');
});

test('parseEnvelope tolerates leading noise by taking the last JSON line', () => {
  const envelope = parseEnvelope('progress...\n{"schemaVersion":1,"type":"result","command":"x","data":{}}');
  assert.equal(envelope?.command, 'x');
  assert.equal(envelope?.type, 'result');
});

test('parseEnvelope returns undefined for empty output', () => {
  assert.equal(parseEnvelope('   \n'), undefined);
});

test('cache-path returns a structured result', { skip: !hasBinary }, async () => {
  const result = await isolatedClient().cachePath();
  assert.equal(typeof result.path, 'string');
  assert.ok(result.path.length > 0);
});

test('usage errors carry the usage exit code', { skip: !hasBinary }, async () => {
  await assert.rejects(
    () => isolatedClient().run(['zotero', 'export']),
    (err: unknown) => err instanceof TpixError && err.isUsageError,
  );
});

test('invalid invocations fail as TpixError', { skip: !hasBinary }, async () => {
  await assert.rejects(() => isolatedClient().run(['info']), (err: unknown) => err instanceof TpixError);
});

test(
  'login and logout round-trip',
  { skip: !hasBinary || process.platform === 'win32' },
  async () => {
    const client = isolatedClient();
    const login = await client.login('test-key');
    assert.equal(login.success, true);

    const logout = await client.logout();
    assert.equal(logout.success, true);
  },
);
