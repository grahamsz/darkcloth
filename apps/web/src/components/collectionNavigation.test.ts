import { describe, expect, it } from "vitest";
import { getCollectionNavigationState } from "./collectionNavigation";

const items = [
  { id: "first", name: "First" },
  { id: "second", name: "Second" },
  { id: "third", name: "Third" },
];

describe("getCollectionNavigationState", () => {
  it("finds previous and next items", () => {
    const state = getCollectionNavigationState(items, "second");

    expect(state.currentIndex).toBe(1);
    expect(state.total).toBe(3);
    expect(state.previous?.item.id).toBe("first");
    expect(state.next?.item.id).toBe("third");
  });

  it("handles the first item", () => {
    const state = getCollectionNavigationState(items, "first");

    expect(state.previous).toBeNull();
    expect(state.next?.item.id).toBe("second");
  });

  it("handles the last item", () => {
    const state = getCollectionNavigationState(items, "third");

    expect(state.previous?.item.id).toBe("second");
    expect(state.next).toBeNull();
  });

  it("handles missing ids", () => {
    const state = getCollectionNavigationState(items, "missing");

    expect(state.currentIndex).toBeNull();
    expect(state.previous).toBeNull();
    expect(state.next).toBeNull();
    expect(state.total).toBe(3);
  });
});
