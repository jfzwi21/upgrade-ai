jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: {},
}));

import {
  StorageIntegrityHealer,
  type StorageIntegrityNativeModule,
} from "../StorageIntegrityHealer";

describe("StorageIntegrityHealer", () => {
  it("returns the real healthy PRAGMA report and maintenance status", async () => {
    const native: StorageIntegrityNativeModule = {
      checkAndOptimize: jest.fn().mockResolvedValue({
        status: "healthy",
        integrityCheck: ["ok"],
        vacuum: "performed",
      }),
    };

    await expect(
      new StorageIntegrityHealer(native).checkAndRepair(),
    ).resolves.toEqual({
      health: "healthy",
      integrityCheck: ["ok"],
      vacuum: "performed",
    });
    expect(native.checkAndOptimize).toHaveBeenCalledTimes(1);
  });

  it("reports corruption without attempting a repair or database replacement", async () => {
    const native: StorageIntegrityNativeModule = {
      checkAndOptimize: jest.fn().mockResolvedValue({
        status: "corrupt",
        integrityCheck: ["row 12 missing from index"],
        vacuum: "not_run",
        detail: "No database mutation was attempted.",
      }),
    };

    await expect(
      new StorageIntegrityHealer(native).checkAndRepair(),
    ).resolves.toEqual({
      health: "corrupt",
      integrityCheck: ["row 12 missing from index"],
      vacuum: "not_run",
      detail: "No database mutation was attempted.",
    });
  });

  it("fails closed and preserves the database when the native checker throws", async () => {
    const warning = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const native: StorageIntegrityNativeModule = {
      checkAndOptimize: jest
        .fn()
        .mockRejectedValue(new Error("SQLite lock unavailable")),
    };

    await expect(
      new StorageIntegrityHealer(native).checkAndRepair(),
    ).resolves.toMatchObject({
      health: "unavailable",
      vacuum: "not_run",
      detail: "SQLite lock unavailable",
    });
    warning.mockRestore();
  });
});
