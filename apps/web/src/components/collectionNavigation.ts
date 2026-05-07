export type CollectionItem = {
  id: string;
};

export type CollectionNeighbor<T extends CollectionItem> = {
  item: T;
  index: number;
};

export type CollectionNavigationState<T extends CollectionItem> = {
  previous: CollectionNeighbor<T> | null;
  currentIndex: number | null;
  next: CollectionNeighbor<T> | null;
  total: number;
};

export function getCollectionNavigationState<T extends CollectionItem>(
  items: readonly T[],
  currentId: string | null | undefined,
): CollectionNavigationState<T> {
  if (!currentId) {
    return { previous: null, currentIndex: null, next: null, total: items.length };
  }

  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex === -1) {
    return { previous: null, currentIndex: null, next: null, total: items.length };
  }

  const previousItem = items[currentIndex - 1] ?? null;
  const nextItem = items[currentIndex + 1] ?? null;

  return {
    previous: previousItem ? { item: previousItem, index: currentIndex - 1 } : null,
    currentIndex,
    next: nextItem ? { item: nextItem, index: currentIndex + 1 } : null,
    total: items.length,
  };
}
