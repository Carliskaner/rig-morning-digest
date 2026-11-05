import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const application = createApp(config);
    const res = await application.request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const linkedNights = [...html.matchAll(/<a href="\/digest\/(2026-10-\d{2})">/g)].map(([, night]) => night);
    expect(linkedNights).toEqual(['2026-10-28', '2026-10-27']);

    for (const night of linkedNights) {
      expect((await application.request(`/digest/${night}`)).status).toBe(200);
    }
  });

  it('links a night with raw run-event status counts', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-board-'));
    try {
      writeFileSync(
        join(runsDir, '2026-10-30.jsonl'),
        [
          { at: '2026-10-30T01:00:00+01:00', job: 'repeated', status: 'retry', owner: 'rook' },
          { at: '2026-10-30T01:01:00+01:00', job: 'repeated', status: 'ok', owner: 'rook' },
          { at: '2026-10-30T01:02:00+01:00', job: 'repeated', status: 'fail', owner: 'rook' },
          { at: '2026-10-30T01:03:00+01:00', job: 'single', status: 'ok', owner: 'rook' },
          '{bad json',
        ].map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n'),
      );

      const application = createApp({ ...config, runsDir });
      const response = await application.request('/');
      const html = await response.text();

      expect(html).toContain('<a href="/digest/2026-10-30">2026-10-30</a>');
      expect(html).toContain('ok 2 / retry 1 / fail 1');
      expect((await application.request('/digest/2026-10-30')).status).toBe(200);
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
