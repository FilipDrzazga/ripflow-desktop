import { describe, it, expect, vi } from "vitest";
import { createCloudMetres, dayKeyOf, previousDayKey, sumByDayAndDevice, CloudError } from "./cloudMetres.js";

const LONDON = "Europe/London";

describe("day keys", () => {
  it("names the day in the given zone, not in UTC (23:30 UTC in BST is already the next day)", () => {
    expect(dayKeyOf(new Date("2026-10-15T23:30:00Z"), LONDON)).toBe("2026-10-16");
    expect(dayKeyOf(new Date("2026-10-15T22:30:00Z"), LONDON)).toBe("2026-10-15");
    // after the clocks go back (25 October) UTC and London agree
    expect(dayKeyOf(new Date("2026-10-26T23:30:00Z"), LONDON)).toBe("2026-10-26");
  });

  it("steps back over a month and a year end", () => {
    expect(previousDayKey("2026-10-16")).toBe("2026-10-15");
    expect(previousDayKey("2026-11-01")).toBe("2026-10-31");
    expect(previousDayKey("2027-01-01")).toBe("2026-12-31");
  });
});

describe("sumByDayAndDevice", () => {
  const record = (device, metresPerPrint, ...prints) => ({ device, metresPerPrint, prints });
  const at = (iso, copies = 1) => ({ printedAt: iso, copies });

  it("adds the metres of every print to its machine and its day", () => {
    const byDay = sumByDayAndDevice(
      [
        record("H8", 10, at("2026-10-15T09:00:00Z")),
        record("H8", 5, at("2026-10-15T10:00:00Z"), at("2026-10-16T08:00:00Z")),
        record("YOKO 1", 2, at("2026-10-16T08:00:00Z", 3)),
      ],
      ["2026-10-15", "2026-10-16"],
      LONDON,
    );
    expect(byDay.get("2026-10-15").get("H8")).toEqual({ metres: 15, jobs: 2 });
    expect(byDay.get("2026-10-16").get("H8")).toEqual({ metres: 5, jobs: 1 });
    expect(byDay.get("2026-10-16").get("YOKO 1")).toEqual({ metres: 6, jobs: 1 });
  });

  it("a job that printed twice on one day is one job and two lengths", () => {
    const byDay = sumByDayAndDevice([record("H8", 1, at("2026-10-15T10:00:00Z"), at("2026-10-15T10:02:00Z"))], ["2026-10-15"], LONDON);
    expect(byDay.get("2026-10-15").get("H8")).toEqual({ metres: 2, jobs: 1 });
  });

  it("the day is the day of the PRINT in the station's zone", () => {
    // 23:30 UTC on the 15th is 00:30 on the 16th in London (BST)
    const byDay = sumByDayAndDevice([record("H8", 7, at("2026-10-15T23:30:00Z"))], ["2026-10-15", "2026-10-16"], LONDON);
    expect(byDay.get("2026-10-15").has("H8")).toBe(false);
    expect(byDay.get("2026-10-16").get("H8").metres).toBe(7);
  });

  it("ignores other days, jobs without metres and prints without a device", () => {
    const byDay = sumByDayAndDevice(
      [record("H8", 9, at("2026-10-13T09:00:00Z")), record("H8", null, at("2026-10-15T09:00:00Z")), record("", 3, at("2026-10-15T09:00:00Z"))],
      ["2026-10-15"],
      LONDON,
    );
    expect(byDay.get("2026-10-15").size).toBe(0);
  });
});

// A fake Cloud: a job list and one Job XML per guid.
const NOW = Date.parse("2026-10-16T11:00:00Z");

// 1417.322835 units / 18 * 0.0254 = 2.0 m
const TWO_METRES = 2;

const xmlFor = ({ height = 1417.322835, printedAt = null }) =>
  `<Job Version="3"><Statistics><Summary Number="0"><Height>${height}</Height></Summary></Statistics>` +
  `<Journal>${printedAt ? `<Print Process="Spooler" Date="${printedAt}" />` : ""}</Journal>` +
  `<PageCopies><Page Requested="1" Done="${printedAt ? 1 : 0}" /></PageCopies></Job>`;

const makeFetch = ({ jobs, xml, listStatus = 200 }) =>
  vi.fn(async (url) => {
    if (url.endsWith("/job/list")) {
      return { ok: listStatus === 200, status: listStatus, json: async () => jobs };
    }
    const guid = decodeURIComponent(url.split("/job/")[1]);
    return { ok: true, status: 200, text: async () => xml[guid] };
  });

const job = (guid, device, status = "Deleted") => ({ JobGUID: guid, JobName: guid, Device: device, Status: status });

const service = (fetchImpl, { now = () => NOW } = {}) =>
  createCloudMetres({ getKey: () => "test-key-12345", fetchImpl, now, timeZone: LONDON });

const xmlCallsOf = (fetchImpl) =>
  fetchImpl.mock.calls.map(([url]) => url).filter((url) => url.includes("/job/") && !url.endsWith("/job/list"));

describe("createCloudMetres", () => {
  it("answers { configured: false } and calls nothing without a key", async () => {
    const fetchImpl = vi.fn();
    const svc = createCloudMetres({ getKey: () => null, fetchImpl, now: () => NOW, timeZone: LONDON });
    expect(await svc.getDayMetres()).toEqual({ configured: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sums yesterday and today per machine, sends the key as MisKey, skips documents without a device", async () => {
    const fetchImpl = makeFetch({
      jobs: [job("a", "H8"), job("b", "YOKO 1"), { JobGUID: "doc", Device: null, Status: null }],
      xml: {
        a: xmlFor({ printedAt: "2026-10-15T09:00:00" }),
        b: xmlFor({ printedAt: "2026-10-16T08:00:00" }),
      },
    });
    const out = await service(fetchImpl).getDayMetres();
    expect(out.yesterdayKey).toBe("2026-10-15");
    expect(out.todayKey).toBe("2026-10-16");
    const byName = Object.fromEntries(out.devices.map((d) => [d.name, d]));
    expect(byName["H8"].yesterday.metres).toBeCloseTo(TWO_METRES, 5);
    expect(byName["H8"].today).toEqual({ metres: 0, jobs: 0 });
    expect(byName["YOKO 1"].today.metres).toBeCloseTo(TWO_METRES, 5);
    // the list and the two jobs, nothing for the document
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.every(([, init]) => init.headers.MisKey === "test-key-12345")).toBe(true);
  });

  it("asks for a week of jobs: a job made days ago can be printed today", async () => {
    const fetchImpl = makeFetch({ jobs: [], xml: {} });
    await service(fetchImpl).getDayMetres();
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.DateTimeFrom).toBe("2026-10-09T11:00:00.000Z");
    expect(body.DateTimeTo).toBe("2026-10-16T11:00:00.000Z");
  });

  it("reads a finished job (Deleted / Completed) once, and a job still open again after five minutes", async () => {
    let now = NOW;
    const fetchImpl = makeFetch({
      jobs: [job("done", "H8", "Deleted"), job("open", "H8", "InProgress")],
      xml: { done: xmlFor({ printedAt: "2026-10-16T08:00:00" }), open: xmlFor({}) },
    });
    const svc = service(fetchImpl, { now: () => now });
    await svc.getDayMetres();

    now += 2 * 60000; // after the one-minute memo, before the five-minute window
    await svc.getDayMetres();
    expect(xmlCallsOf(fetchImpl).filter((u) => u.endsWith("/done"))).toHaveLength(1);
    expect(xmlCallsOf(fetchImpl).filter((u) => u.endsWith("/open"))).toHaveLength(1);

    now += 5 * 60000;
    await svc.getDayMetres();
    expect(xmlCallsOf(fetchImpl).filter((u) => u.endsWith("/done"))).toHaveLength(1);
    expect(xmlCallsOf(fetchImpl).filter((u) => u.endsWith("/open"))).toHaveLength(2);
  });

  it("answers a second call within a minute from memory and shares a call already in flight", async () => {
    const fetchImpl = makeFetch({ jobs: [job("a", "H8")], xml: { a: xmlFor({ printedAt: "2026-10-16T08:00:00" }) } });
    const svc = service(fetchImpl);
    const [first, second] = await Promise.all([svc.getDayMetres(), svc.getDayMetres()]);
    expect(second).toBe(first);
    const calls = fetchImpl.mock.calls.length;
    expect(await svc.getDayMetres()).toBe(first);
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it("a rejected key is CLOUD_UNAUTHORIZED, no network is CLOUD_UNREACHABLE, anything else a CloudError", async () => {
    await expect(service(makeFetch({ jobs: [], xml: {}, listStatus: 401 })).getDayMetres()).rejects.toMatchObject({ code: "CLOUD_UNAUTHORIZED" });
    const down = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    await expect(service(down).getDayMetres()).rejects.toMatchObject({ code: "CLOUD_UNREACHABLE" });
    await expect(service(makeFetch({ jobs: [], xml: {}, listStatus: 500 })).getDayMetres()).rejects.toBeInstanceOf(CloudError);
  });

  it("one job that cannot be read does not hide the others, and is counted", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("/job/list")) return { ok: true, status: 200, json: async () => [job("good", "H8"), job("bad", "H8")] };
      if (url.endsWith("/bad")) return { ok: false, status: 500, text: async () => "" };
      return { ok: true, status: 200, text: async () => xmlFor({ printedAt: "2026-10-16T08:00:00" }) };
    });
    const out = await service(fetchImpl).getDayMetres();
    expect(out.partialJobs).toBe(1);
    expect(out.devices[0].today.metres).toBeCloseTo(TWO_METRES, 5);
  });

  it("reset forgets the previous key's numbers", async () => {
    const fetchImpl = makeFetch({ jobs: [job("a", "H8")], xml: { a: xmlFor({ printedAt: "2026-10-16T08:00:00" }) } });
    const svc = service(fetchImpl);
    await svc.getDayMetres();
    const calls = fetchImpl.mock.calls.length;
    svc.reset();
    await svc.getDayMetres();
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls);
  });

  it("testKey tries the key it is given, not the stored one", async () => {
    const fetchImpl = makeFetch({ jobs: [], xml: {} });
    const svc = createCloudMetres({ getKey: () => "stored-key-0000", fetchImpl, now: () => NOW, timeZone: LONDON });
    await svc.testKey("typed-key-12345");
    expect(fetchImpl.mock.calls.every(([, init]) => init.headers.MisKey === "typed-key-12345")).toBe(true);
    const rejecting = createCloudMetres({ getKey: () => null, fetchImpl: makeFetch({ jobs: [], xml: {}, listStatus: 401 }), now: () => NOW });
    await expect(rejecting.testKey("bad-key-123456")).rejects.toMatchObject({ code: "CLOUD_UNAUTHORIZED" });
  });
});
