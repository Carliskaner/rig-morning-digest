import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-route-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(night: string, contents: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest page', () => {
  it('sorts jobs and marks rows with three retries or a failure', async () => {
    writeNight(
      '2026-10-28',
      [
        { at: '2026-10-28T01:00:00+01:00', job: 'zeta/ok', status: 'ok', owner: null },
        { at: '2026-10-28T01:00:00+01:00', job: 'beta/fail', status: 'fail', owner: 'rook' },
        { at: '2026-10-28T01:00:00+01:00', job: 'alpha/retry', status: 'retry', owner: 'rook' },
        { at: '2026-10-28T01:01:00+01:00', job: 'alpha/retry', status: 'retry', owner: 'rook' },
        { at: '2026-10-28T01:02:00+01:00', job: 'alpha/retry', status: 'retry', owner: 'rook' },
      ].map((entry) => JSON.stringify(entry)).join('\n'),
    );

    const response = await app().request('/digest/2026-10-28');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html.indexOf('alpha/retry')).toBeLessThan(html.indexOf('beta/fail'));
    expect(html.indexOf('beta/fail')).toBeLessThan(html.indexOf('zeta/ok'));
    expect(html.match(/<tr class="warn">/g) ?? []).toHaveLength(2);
  });

  it('returns 404 when the night file is missing', async () => {
    const response = await app().request('/digest/2026-10-29');

    expect(response.status).toBe(404);
  });

  it('says nothing ran for an empty night file', async () => {
    writeNight('2026-10-28', '');

    const response = await app().request('/digest/2026-10-28');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders valid rows when the night file contains a malformed line', async () => {
    writeNight(
      '2026-10-28',
      '{malformed line}\n{"at":"2026-10-28T01:00:00+01:00","job":"alpha/ok","status":"ok","owner":"rook"}',
    );

    const response = await app().request('/digest/2026-10-28');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<table');
    expect(html).toContain('alpha/ok');
  });
});

describe('digest JSON', () => {
  it('returns 404 when the night file is missing', async () => {
    const response = await app().request('/api/digest/2026-10-29');

    expect(response.status).toBe(404);
  });

  it('returns an empty array for an empty night file', async () => {
    writeNight('2026-10-28', '');

    const response = await app().request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('returns rows in the same job order as the digest page', async () => {
    writeNight(
      '2026-10-28',
      [
        { at: '2026-10-28T01:00:00+01:00', job: 'zeta/ok', status: 'ok', owner: null },
        { at: '2026-10-28T01:00:00+01:00', job: 'beta/fail', status: 'fail', owner: 'rook' },
        { at: '2026-10-28T01:00:00+01:00', job: 'alpha/retry', status: 'retry', owner: 'rook' },
      ].map((entry) => JSON.stringify(entry)).join('\n'),
    );

    const application = app();
    const [jsonResponse, pageResponse] = await Promise.all([
      application.request('/api/digest/2026-10-28'),
      application.request('/digest/2026-10-28'),
    ]);
    const rows = (await jsonResponse.json()) as { job: string }[];
    const html = await pageResponse.text();
    const pageJobs = [...html.matchAll(/<tr(?: class="[^"]*")?><td>(.*?)<\/td>/g)].map(
      ([, job]) => job,
    );

    expect(jsonResponse.status).toBe(200);
    expect(rows.map((row) => row.job)).toEqual(pageJobs);
    expect(rows.map((row) => row.job)).toEqual(['alpha/retry', 'beta/fail', 'zeta/ok']);
  });

  it('returns valid parsed rows when the night file contains a malformed line', async () => {
    writeNight(
      '2026-10-28',
      '{malformed line}\n{"at":"2026-10-28T01:00:00+01:00","job":"alpha/ok","status":"ok","owner":"rook"}',
    );

    const response = await app().request('/api/digest/2026-10-28');
    const rows = await response.json();

    expect(response.status).toBe(200);
    expect(rows).toEqual([
      {
        job: 'alpha/ok',
        owner: 'rook',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstTime: '2026-10-28T01:00:00+01:00',
        lastTime: '2026-10-28T01:00:00+01:00',
      },
    ]);
  });
});
