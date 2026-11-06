import {
  WATCHDOG_STARTUP_WINDOW_MS,
  WATCHDOG_STORAGE_KEY,
  WatchdogService,
  type WatchdogStorage,
} from "../WatchdogService";

class MemoryStorage implements WatchdogStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  setRaw(key: string, value: string) {
    this.values.set(key, value);
  }
}

const launch = (storage: MemoryStorage, timestamp: number) =>
  new WatchdogService(storage, () => timestamp);

describe("WatchdogService", () => {
  it("records the first launch without enabling safe mode", async () => {
    const storage = new MemoryStorage();
    const status = await launch(storage, 1_000).start();

    expect(status).toEqual({
      safeMode: false,
      consecutiveFailures: 0,
      storageAvailable: true,
    });
    expect(
      JSON.parse((await storage.getItem(WATCHDOG_STORAGE_KEY)) as string),
    ).toMatchObject({
      lastLaunchStartedAt: 1_000,
      consecutiveFailures: 0,
    });
  });

  it("enables safe mode on the launch after two consecutive early failures", async () => {
    const storage = new MemoryStorage();

    expect(await launch(storage, 1_000).start()).toMatchObject({
      safeMode: false,
    });
    expect(await launch(storage, 4_000).start()).toMatchObject({
      safeMode: false,
      consecutiveFailures: 1,
    });
    expect(await launch(storage, 8_000).start()).toMatchObject({
      safeMode: true,
      consecutiveFailures: 2,
    });
  });

  it("counts an unmarked crash even if the user waits more than 15 seconds to relaunch", async () => {
    const storage = new MemoryStorage();

    await launch(storage, 1_000).start();
    const status = await launch(
      storage,
      1_000 + WATCHDOG_STARTUP_WINDOW_MS + 60_000,
    ).start();

    expect(status).toMatchObject({ safeMode: false, consecutiveFailures: 1 });
  });

  it("does not count a caught startup failure twice across the relaunch", async () => {
    const storage = new MemoryStorage();
    let now = 1_000;
    const firstLaunch = new WatchdogService(storage, () => now);
    await firstLaunch.start();
    expect(await firstLaunch.markStartupFailed()).toMatchObject({
      safeMode: false,
      consecutiveFailures: 1,
    });

    now = 4_000;
    const secondLaunch = new WatchdogService(storage, () => now);
    expect(await secondLaunch.start()).toMatchObject({
      safeMode: false,
      consecutiveFailures: 1,
    });
    now = 5_000;
    expect(await secondLaunch.markStartupFailed()).toMatchObject({
      safeMode: true,
      consecutiveFailures: 2,
    });
  });

  it("clears the failure streak when the caller marks startup healthy", async () => {
    const storage = new MemoryStorage();

    await launch(storage, 1_000).start();
    await launch(storage, 4_000).start();
    const status = await launch(storage, 8_000).start();
    expect(status.safeMode).toBe(true);

    const healthy = await launch(storage, 9_000).markStartupHealthy();
    expect(healthy).toEqual({
      safeMode: false,
      consecutiveFailures: 0,
      storageAvailable: true,
    });
    expect(
      JSON.parse((await storage.getItem(WATCHDOG_STORAGE_KEY)) as string),
    ).toMatchObject({
      lastLaunchStartedAt: null,
      consecutiveFailures: 0,
    });
  });

  it("recovers from malformed watchdog data without touching other storage keys", async () => {
    const storage = new MemoryStorage();
    storage.setRaw(WATCHDOG_STORAGE_KEY, "{broken");
    storage.setRaw("chat-data", "preserve-me");

    const status = await launch(storage, 5_000).start();

    expect(status).toMatchObject({ safeMode: false, consecutiveFailures: 0 });
    expect(await storage.getItem("chat-data")).toBe("preserve-me");
  });

  it("continues startup if local watchdog storage is unavailable", async () => {
    const unavailableStorage: WatchdogStorage = {
      getItem: async () => {
        throw new Error("storage unavailable");
      },
      setItem: async () => {
        throw new Error("storage unavailable");
      },
    };
    const warning = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(
      new WatchdogService(unavailableStorage, () => 1_000).start(),
    ).resolves.toEqual({
      safeMode: false,
      consecutiveFailures: 0,
      storageAvailable: false,
    });

    warning.mockRestore();
  });
});
