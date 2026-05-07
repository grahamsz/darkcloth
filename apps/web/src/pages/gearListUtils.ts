const gearNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const compareGearDisplayNames = (left: string, right: string) => {
  return gearNameCollator.compare(left.trim(), right.trim());
};

export const sortGearItemsByDisplayName = <T>(
  items: readonly T[],
  getDisplayName: (item: T) => string,
) => {
  return [...items].sort((left, right) => compareGearDisplayNames(getDisplayName(left), getDisplayName(right)));
};
