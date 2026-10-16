import { parseCloudJobXml } from "./parseCloudJobXml.js";

// Metres printed per machine for yesterday and today, from the PrintFactory Cloud API (FILIP
// 2026-10-16: his KPI sheet counts every job a machine printed, also the ones made by hand in
// Layout that RipFlow never sees). Read-only: two calls only, POST job/list and GET job/{guid}.
// "The day" is the day of the PRINT (Journal Print@Date) in the station's time zone, not the day
// the job was created: a 30 m job made on the 13th was printed on the 15th and belongs there.
// The Cloud calls a machine by its own name ("d.gen Artrix H8", "YOKO 1", "YUMI 2"); RipFlow's
// printer codes are not mapped to them, the tile shows the Cloud name as is.

export const CLOUD_BASE_URL = "https://api.aurelon.com/api/v2";

// A job printed on the day being counted can have been created days before (a long queue).
const LOOKBACK_DAYS = 7;
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 20000;
// A job the Cloud calls Deleted or Completed will not print again, so its XML is read once. Any
// other job is read again after this long: it may not have printed yet, or may print once more.
const NON_FINAL_TTL_MS = 5 * 60000;
// Several windows or a poll that fires twice must not each walk the whole list again.
const MIN_REFRESH_MS = 60000;
const FINAL_STATUSES = new Set(["Deleted", "Completed"]);

export class CloudError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.stage = "cloud";
    this.title = "PrintFactory Cloud";
  }
}

// "YYYY-MM-DD" of `date` in `timeZone` (undefined = the station's own zone).
export const dayKeyOf = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// Calendar arithmetic on the key itself, so a 23 or 25 hour day cannot move the answer.
export const previousDayKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// records: [{ device, metresPerPrint, prints: [{ printedAt, copies }] }]. Returns
// Map(dayKey -> Map(device -> { metres, jobs })) for the asked days only; jobs counts a job once
// per day however many times it printed that day.
export const sumByDayAndDevice = (records, dayKeys, timeZone) => {
  const wanted = new Set(dayKeys);
  const byDay = new Map(dayKeys.map((key) => [key, new Map()]));
  for (const { device, metresPerPrint, prints } of records) {
    if (metresPerPrint === null || !device) continue;
    const countedFor = new Set();
    for (const { printedAt, copies } of prints) {
      const day = dayKeyOf(new Date(printedAt), timeZone);
      if (!wanted.has(day)) continue;
      const devices = byDay.get(day);
      const row = devices.get(device) ?? { metres: 0, jobs: 0 };
      row.metres += metresPerPrint * copies;
      if (!countedFor.has(day)) {
        row.jobs += 1;
        countedFor.add(day);
      }
      devices.set(device, row);
    }
  }
  return byDay;
};

const runPool = async (items, limit, worker) => {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(runners);
};

export const createCloudMetres = ({ getKey, fetchImpl = fetch, now = () => Date.now(), timeZone } = {}) => {
  const jobCache = new Map(); // JobGUID -> { record, final, fetchedAt }
  let inFlight = null;
  let last = null; // { at, result }

  const request = async (key, method, path, { body, accept } = {}) => {
    let response;
    try {
      response = await fetchImpl(`${CLOUD_BASE_URL}${path}`, {
        method,
        headers: {
          MisKey: key,
          Accept: accept ?? "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new CloudError("CLOUD_UNREACHABLE", `PrintFactory Cloud is unreachable (${err.message}).`);
    }
    if (response.status === 401) {
      throw new CloudError("CLOUD_UNAUTHORIZED", "PrintFactory Cloud rejected the key (MisKey).");
    }
    if (!response.ok) {
      throw new CloudError(`CLOUD_HTTP_${response.status}`, `PrintFactory Cloud answered ${response.status}.`);
    }
    return response;
  };

  const listJobs = async (key, fromMs) => {
    const response = await request(key, "POST", "/job/list", {
      body: { DateTimeFrom: new Date(fromMs).toISOString(), DateTimeTo: new Date(now()).toISOString() },
    });
    const jobs = await response.json();
    if (!Array.isArray(jobs)) throw new CloudError("CLOUD_BAD_RESPONSE", "PrintFactory Cloud sent a job list in an unknown shape.");
    // Jobs with no device are the documents the RIP uploaded, never a print.
    return jobs.filter((job) => job?.JobGUID && job.Device);
  };

  const readJob = async (key, job) => {
    const cached = jobCache.get(job.JobGUID);
    if (cached && (cached.final || now() - cached.fetchedAt < NON_FINAL_TTL_MS)) return cached.record;
    const response = await request(key, "GET", `/job/${encodeURIComponent(job.JobGUID)}`, { accept: "application/xml" });
    const parsed = parseCloudJobXml(await response.text());
    const record = { device: job.Device, ...parsed };
    jobCache.set(job.JobGUID, { record, final: FINAL_STATUSES.has(job.Status), fetchedAt: now() });
    return record;
  };

  const compute = async (key) => {
    const todayKey = dayKeyOf(new Date(now()), timeZone);
    const yesterdayKey = previousDayKey(todayKey);
    const jobs = await listJobs(key, now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

    const liveGuids = new Set(jobs.map((job) => job.JobGUID));
    for (const guid of jobCache.keys()) if (!liveGuids.has(guid)) jobCache.delete(guid);

    const records = [];
    let partialJobs = 0;
    await runPool(jobs, CONCURRENCY, async (job) => {
      try {
        records.push(await readJob(key, job));
      } catch (err) {
        // One job that cannot be read must not hide the rest - except a rejected key or no
        // network at all, which would fail every job the same way.
        if (err.code === "CLOUD_UNAUTHORIZED" || err.code === "CLOUD_UNREACHABLE") throw err;
        partialJobs += 1;
      }
    });

    const byDay = sumByDayAndDevice(records, [yesterdayKey, todayKey], timeZone);
    const names = new Set([...byDay.get(yesterdayKey).keys(), ...byDay.get(todayKey).keys()]);
    const none = { metres: 0, jobs: 0 };
    return {
      configured: true,
      fetchedAt: new Date(now()).toISOString(),
      partialJobs,
      yesterdayKey,
      todayKey,
      devices: [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          yesterday: byDay.get(yesterdayKey).get(name) ?? none,
          today: byDay.get(todayKey).get(name) ?? none,
        })),
    };
  };

  // { configured:false } with no key; throws CloudError otherwise on a failure that spoils every job.
  const getDayMetres = async () => {
    const key = getKey();
    if (!key) return { configured: false };
    if (inFlight) return inFlight;
    if (last && now() - last.at < MIN_REFRESH_MS) return last.result;
    inFlight = compute(key)
      .then((result) => {
        last = { at: now(), result };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  // Settings "Test": the server answers and the key is accepted. Uses the key it is given (the
  // one just typed), never the stored one, and does not touch the cache.
  const testKey = async (key) => {
    await request(key, "GET", "");
    await request(key, "POST", "/job/list", {
      body: { DateTimeFrom: new Date(now() - 3600 * 1000).toISOString(), DateTimeTo: new Date(now()).toISOString() },
    });
    return true;
  };

  // A new or removed key must not be answered from the previous key's numbers.
  const reset = () => {
    jobCache.clear();
    last = null;
  };

  return { getDayMetres, testKey, reset };
};
