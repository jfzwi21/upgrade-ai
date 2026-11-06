jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: {
    VectorBox: {
      getCount: jest.fn(),
      workspaceVectorCount: jest.fn(),
      semanticSearch: jest.fn(),
      insert: jest.fn(),
    },
  },
}));

import { NativeModules } from "react-native";
import { SafeModeService } from "@/services/selfHealing/SafeModeService";
import VectorDB from "../VectorDB";

const vectorBox = NativeModules.VectorBox as {
  getCount: jest.Mock;
  workspaceVectorCount: jest.Mock;
  semanticSearch: jest.Mock;
  insert: jest.Mock;
};

describe("VectorDB Safe Mode guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SafeModeService.setEnabled(true, "healthy");
  });

  afterAll(() => {
    SafeModeService.setEnabled(false, "not_checked");
  });

  it("skips local vector reads and semantic retrieval", async () => {
    await expect(VectorDB.getVectorCount()).resolves.toBe(0);
    await expect(VectorDB.getWorkspaceVectorCount("workspace-a")).resolves.toBe(
      0,
    );
    await expect(
      VectorDB.runSemanticSearch("workspace-a", [0.1, 0.2]),
    ).resolves.toEqual([]);

    expect(vectorBox.getCount).not.toHaveBeenCalled();
    expect(vectorBox.workspaceVectorCount).not.toHaveBeenCalled();
    expect(vectorBox.semanticSearch).not.toHaveBeenCalled();
  });

  it("rejects new vector writes while preserving the existing store", async () => {
    await expect(
      VectorDB.insertVector("workspace-a", [0.1], { content: "test" }),
    ).rejects.toThrow(
      "Vector insertion is disabled while Safe Mode is active.",
    );
    expect(vectorBox.insert).not.toHaveBeenCalled();
  });
});
