export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstTime: string;
  lastTime: string;
};

export type NightCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: NightCounts;
};

export type ReadNight = (runsDir: string, night: string) => NightDigest;