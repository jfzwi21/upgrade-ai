import { IRAQI_KNOWLEDGE, IRAQI_KNOWLEDGE_VERSION } from "../iraqiKnowledge";

describe("Iraqi Arabic local knowledge", () => {
  it("contains versioned, uniquely identified Arabic reference entries", () => {
    const ids = IRAQI_KNOWLEDGE.map(record => record.id);

    expect(IRAQI_KNOWLEDGE_VERSION).toBeTruthy();
    expect(IRAQI_KNOWLEDGE.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      IRAQI_KNOWLEDGE.every(
        record => record.title.trim() && record.content.trim(),
      ),
    ).toBe(true);
    expect(
      IRAQI_KNOWLEDGE.every(record => /[\u0600-\u06FF]/.test(record.content)),
    ).toBe(true);
  });

  it("covers core Iraqi dialect and cultural topics without collapsing them into one category", () => {
    const categories = new Set(IRAQI_KNOWLEDGE.map(record => record.category));
    const allContent = IRAQI_KNOWLEDGE.map(record => record.content).join("\n");

    expect(categories).toEqual(
      new Set([
        "conversation",
        "vocabulary",
        "grammar",
        "culture",
        "regional-variation",
      ]),
    );
    expect(allContent).toContain("شلون");
    expect(allContent).toContain("أكو");
    expect(allContent).toContain("رمضان");
    expect(allContent).toContain("تختلف");
  });
});
