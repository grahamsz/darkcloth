import { describe, expect, it } from "vitest";
import { readCachedItemFromDirectOrList } from "./resourceLoaders";

describe("readCachedItemFromDirectOrList", () => {
  it("uses the direct cached item when it exists", async () => {
    await expect(
      readCachedItemFromDirectOrList(
        Promise.resolve({ id: "lens-1", name: "Direct lens" }),
        Promise.resolve([{ id: "lens-1", name: "List lens" }]),
        "lens-1",
      ),
    ).resolves.toEqual({ id: "lens-1", name: "Direct lens" });
  });

  it("falls back to the cached list by id when the direct item is missing", async () => {
    await expect(
      readCachedItemFromDirectOrList(
        Promise.resolve(null),
        Promise.resolve([
          { id: "lens-1", name: "First lens" },
          { id: "lens-2", name: "Second lens" },
        ]),
        "lens-2",
      ),
    ).resolves.toEqual({ id: "lens-2", name: "Second lens" });
  });

  it("returns null when neither cache path has the item", async () => {
    await expect(
      readCachedItemFromDirectOrList(
        Promise.resolve(null),
        Promise.resolve([{ id: "lens-1", name: "First lens" }]),
        "missing",
      ),
    ).resolves.toBeNull();
  });
});
