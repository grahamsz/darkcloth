import { api } from "../api/client";
import {
  readCachedCamera,
  readCachedCameras,
  readCachedFilmHolder,
  readCachedFilmHolders,
  readCachedFilmStock,
  readCachedFilmStocks,
  readCachedFilter,
  readCachedFilters,
  readCachedLens,
  readCachedLenses,
  readCachedRoll,
  readCachedRolls,
} from "./cache";

type UserRef = { id: string } | null;

export async function readCachedItemsForLoader<T>(
  loadItems: () => Promise<{ items: T[] }>,
  user: UserRef,
): Promise<unknown[]> {
  const loader = loadItems as unknown;
  if (loader === api.listCameras) return readCachedCameras(user);
  if (loader === api.listLenses) return readCachedLenses(user);
  if (loader === api.listFilters) return readCachedFilters(user);
  if (loader === api.listFilmStocks) return readCachedFilmStocks(user);
  if (loader === api.listRolls) return readCachedRolls(user);
  if (loader === api.listFilmHolders) return readCachedFilmHolders(user);
  return [];
}

export async function readCachedItemForLoader<T>(
  loadItem: (id: string) => Promise<T>,
  user: UserRef,
  id: string,
): Promise<unknown | null> {
  if (loadItem === api.getCamera) return readCachedItemFromDirectOrList(readCachedCamera(user, id), readCachedCameras(user), id);
  if (loadItem === api.getLens) return readCachedItemFromDirectOrList(readCachedLens(user, id), readCachedLenses(user), id);
  if (loadItem === api.getFilter) return readCachedItemFromDirectOrList(readCachedFilter(user, id), readCachedFilters(user), id);
  if (loadItem === api.getFilmStock) return readCachedItemFromDirectOrList(readCachedFilmStock(user, id), readCachedFilmStocks(user), id);
  if (loadItem === api.getFilmHolder) return readCachedItemFromDirectOrList(readCachedFilmHolder(user, id), readCachedFilmHolders(user), id);
  if (loadItem === api.getRoll) return readCachedItemFromDirectOrList(readCachedRoll(user, id), readCachedRolls(user), id);
  return null;
}

export async function readCachedItemFromDirectOrList<T extends { id: string }>(
  directItemPromise: Promise<T | null>,
  cachedItemsPromise: Promise<T[]>,
  id: string,
): Promise<T | null> {
  const directItem = await directItemPromise;
  if (directItem) return directItem;

  const cachedItems = await cachedItemsPromise;
  return cachedItems.find((item) => item.id === id) ?? null;
}
