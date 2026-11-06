jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeModeService } from "../SafeModeService";

const mockStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
};

describe("SafeModeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getItem.mockResolvedValue(null);
    mockStorage.setItem.mockResolvedValue(undefined);
    SafeModeService.setQuarantinedWorkspaceSlugs([]);
    SafeModeService.setEnabled(false, "not_checked");
  });

  it("publishes Safe Mode and storage health to subscribers", () => {
    const listener = jest.fn();
    const unsubscribe = SafeModeService.subscribe(listener);

    SafeModeService.setEnabled(true, "healthy");

    expect(SafeModeService.isEnabled()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith({
      enabled: true,
      storageHealth: "healthy",
      quarantinedWorkspaceSlugs: [],
    });
    unsubscribe();
  });

  it("persists quarantine records without touching unrelated user data", async () => {
    mockStorage.getItem.mockResolvedValueOnce(
      JSON.stringify([
        { slug: "broken-workspace", quarantinedAt: 1, reason: "render error" },
      ]),
    );

    await SafeModeService.quarantineWorkspace(
      "second-workspace",
      "native failure",
    );

    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "upgrade-ai:self-healing:quarantined-workspaces:v1",
      expect.stringContaining("second-workspace"),
    );
    expect(SafeModeService.getSnapshot().quarantinedWorkspaceSlugs).toEqual([
      "broken-workspace",
      "second-workspace",
    ]);
  });

  it("restores one workspace while retaining other quarantine records", async () => {
    mockStorage.getItem.mockResolvedValueOnce(
      JSON.stringify([
        { slug: "first", quarantinedAt: 1, reason: "error" },
        { slug: "second", quarantinedAt: 2, reason: "error" },
      ]),
    );

    await SafeModeService.restoreWorkspace("first");

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "upgrade-ai:self-healing:quarantined-workspaces:v1",
      JSON.stringify([{ slug: "second", quarantinedAt: 2, reason: "error" }]),
    );
    expect(SafeModeService.getSnapshot().quarantinedWorkspaceSlugs).toEqual([
      "second",
    ]);
  });

  it("fails safely on malformed quarantine data", async () => {
    mockStorage.getItem.mockResolvedValueOnce("{broken");

    await expect(
      SafeModeService.loadQuarantinedWorkspaceSlugs(),
    ).resolves.toEqual([]);
    expect(SafeModeService.getSnapshot().quarantinedWorkspaceSlugs).toEqual([]);
  });
});
