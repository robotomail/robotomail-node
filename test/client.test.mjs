import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { Robotomail, ApiError, verifyWebhook } from '../dist/index.js';

const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url)));
let server, baseUrl;
before(async () => {
  server = spawn(process.env.PYTHON ?? 'python3', ['test/server.py'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: server.stdout });
  baseUrl = await new Promise((resolve, reject) => { lines.once('line', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Fixture exited ${code}`))); });
  lines.close();
});
after(() => server?.kill());
const client = (apiKey = 'test-key', options = {}) => new Robotomail({ apiKey, baseUrl, ...options });

for (const fixture of cases) {
  test(`wire contract: ${fixture.id}`, async () => {
    const args = [...fixture.paths];
    if (fixture.body !== null) args.push(fixture.body);
    if (fixture.upload) args.push({ data: Uint8Array.from([0, 255, 98, 105, 110, 97, 114, 121, 13, 10]), filename: 'sample.bin' });
    if (Object.keys(fixture.params).length) args.push(fixture.params);
    const result = client()[fixture.id](...args);
    if (fixture.id === 'streamEvents') {
      const frames = []; for await (const frame of result) frames.push(frame);
      assert.deepEqual(frames, [
        { id: 'evt-1', event: 'message.received', data: '{"text":\n"héllo"}' },
        { id: 'evt-1', event: 'message', data: 'second' },
        { id: 'evt-2', event: 'reconnect', data: '{}' },
      ]);
    } else assert.deepEqual(await result, fixture.response);
  });
}
for (const status of [401, 402, 403, 404, 429, 500]) {
  test(`preserves HTTP ${status} error and headers`, async () => {
    await assert.rejects(client(`error-${status}`).listMailboxes(), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, status);
      assert.equal(error.code, 'FIXTURE_ERROR'); assert.equal(error.headers.get('retry-after'), '7');
      assert.equal(error.body.payment_required, status === 402); return true;
    });
  });
}
test('does not follow redirects or retry sends', async () => {
  await assert.rejects(client('redirect').sendMessage('mailbox', { to: ['fixture@example.com'], subject: 'fixture', bodyText: 'fixture' }), { status: 307 });
  const requests = await fetch(baseUrl.replace('/v1', '/__requests')).then(r => r.json());
  assert.equal(requests.filter(r => r.auth === 'Bearer redirect').length, 1);
  assert.ok(!requests.some(r => r.path === '/__unexpected'));
});
test('timeouts and caller cancellation terminate HTTP requests', async () => {
  await assert.rejects(client('slow', { timeoutMs: 15 }).listMailboxes(), { name: 'TimeoutError' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client().listMailboxes({ signal: controller.signal }), { name: 'AbortError' });
});
test('preserves omitted, null, empty string, false and zero values', async () => {
  const c = client('echo');
  assert.deepEqual((await c.updateWebhook('hook', {})).echo, {});
  assert.deepEqual((await c.updateWebhook('hook', { headers: null })).echo, { headers: null });
  assert.deepEqual((await c.updateMailbox('box', { displayName: '' })).echo, { displayName: '' });
  assert.deepEqual((await c.listMessages('box', { limit: 2, offset: 0 })).query, { limit: ['2'], offset: ['0'] });
});
test('handles non-JSON upstream errors without hiding the status', async () => {
  await assert.rejects(client('html').listMailboxes(), error => error.status === 502 && typeof error.body === 'string');
});
test('rejects non-SSE success and releases streams when consumer stops', async () => {
  const fixture = cases.find(c => c.id === 'streamEvents');
  await assert.rejects(async () => { for await (const frame of client('bad-stream').streamEvents(fixture.params)) void frame; }, /non-SSE/);
  const stream = client().streamEvents(fixture.params);
  assert.equal((await stream.next()).value.id, 'evt-1');
  await stream.return();
});
test('verifies exact webhook bytes and rejects malformed or tampered signatures', () => {
  const payload = Buffer.from('{"text":"héllo"}\n'); const secret = 'fixture-secret';
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(verifyWebhook(payload, signature, secret), true);
  for (const candidate of ['', signature.toUpperCase(), 'g'.repeat(64), signature + '0']) assert.equal(verifyWebhook(payload, candidate, secret), false);
  assert.equal(verifyWebhook(Buffer.from(payload.toString().trim()), signature, secret), false);
  assert.equal(verifyWebhook(payload, signature, 'wrong'), false);
});
test('rejects unsafe base URLs and dot segments', async () => {
  for (const baseUrl of ['http://example.com/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=x']) assert.throws(() => new Robotomail({ baseUrl }));
  for (const id of ['', '.', '..']) assert.throws(() => client().getMailbox(id));
});
test('CommonJS package build exports a usable client', async () => {
  const { createRequire } = await import('node:module');
  assert.equal(typeof createRequire(import.meta.url)('../dist-cjs/index.js').Robotomail, 'function');
});
test('upload honors an explicit content type for Blob data', async () => {
  const fixture = cases.find(c => c.id === 'uploadAttachment');
  const data = new Blob([Uint8Array.from([0, 255, 98, 105, 110, 97, 114, 121, 13, 10])], { type: 'text/plain' });
  assert.deepEqual(await client().uploadAttachment({ data, filename: 'sample.bin', contentType: 'application/octet-stream' }), fixture.response);
  await assert.rejects(client().uploadAttachment({ data, filename: 'sample.bin', contentType: 'text/plain\r\nInjected: header' }), /Invalid/);
});
