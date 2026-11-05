import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type RunEntry = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRunEntry(line: string): RunEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.at !== 'string' ||
    typeof value.job !== 'string' ||
    (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail') ||
    (value.owner !== null && typeof value.owner !== 'string') ||
    ('error' in value && typeof value.error !== 'string')
  ) {
    return null;
  }

  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const lines = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8').split(/\r?\n/);
  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  const counts = { ok: 0, retry: 0, fail: 0 };

  for (const line of lines) {
    if (line.trim() === '') continue;

    const entry = parseRunEntry(line);
    if (entry === null) {
      badLines += 1;
      continue;
    }

    counts[entry.status] += 1;
    const row = jobs.get(entry.job);
    if (row === undefined) {
      jobs.set(entry.job, {
        job: entry.job,
        owner: entry.owner,
        runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status,
        lastError: entry.error ?? null,
        firstTime: entry.at,
        lastTime: entry.at,
      });
      continue;
    }

    row.owner = entry.owner;
    row.runs += 1;
    if (entry.status === 'retry') row.retries += 1;
    row.lastStatus = entry.status;
    if (entry.error !== undefined) row.lastError = entry.error;
    row.lastTime = entry.at;
  }

  return {
    rows: [...jobs.values()].sort((left, right) => left.job.localeCompare(right.job)),
    badLines,
    counts,
  };
};