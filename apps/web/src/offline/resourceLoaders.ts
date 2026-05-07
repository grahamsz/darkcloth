import { api } from "../api/client";
import type { Camera, FilmHolder, FilmStock, Filter, Lens, Photograph, PhotographImage, Roll } from "../api/client";
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
  readCachedPhotograph,
  readCachedPhotographImages,
  readCachedPhotographs,
  readCachedRoll,
  readCachedRolls,
} from "./cache";

type UserRef = { id: string } | null;

export interface OfflineReadContext {
  transportStatus: string;
  user: UserRef;
}

export interface PhotoLogResourceSet {
  cameras: Camera[];
  lenses: Lens[];
  filters: Filter[];
  films: FilmStock[];
  filmHolders: FilmHolder[];
  rolls: Roll[];
  filtersLoaded: boolean;
  filtersLoadError: string | null;
}

export interface PhotographEditResourceSet extends PhotoLogResourceSet {
  photograph: Photograph;
  images: PhotographImage[];
}

function isOffline(context: OfflineReadContext) {
  return context.transportStatus === "offline";
}

async function loadListWithCachedFallback<T>(
  context: OfflineReadContext,
  loadRemote: () => Promise<T[]>,
  loadCached: (user: UserRef) => Promise<T[]>,
) {
  if (isOffline(context) && context.user) return loadCached(context.user);
  try {
    return await loadRemote();
  } catch {
    return loadCached(context.user);
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function loadFiltersForForm(context: OfflineReadContext) {
  if (isOffline(context) && context.user) {
    const cached = await readCachedFilters(context.user);
    return {
      filters: cached,
      filtersLoaded: cached.length > 0,
      filtersLoadError: cached.length > 0 ? null : "Filters are not cached for offline use.",
    };
  }

  try {
    return {
      filters: (await api.listFilters({ limit: 200 })).items,
      filtersLoaded: true,
      filtersLoadError: null,
    };
  } catch (error) {
    const cached = await readCachedFilters(context.user);
    return {
      filters: cached,
      filtersLoaded: cached.length > 0,
      filtersLoadError: cached.length > 0 ? null : errorMessage(error, "Failed to load filters."),
    };
  }
}

export async function loadPhotoLogResources(context: OfflineReadContext): Promise<PhotoLogResourceSet> {
  const [cameras, lenses, filtersResult, films, filmHolders, rolls] = await Promise.all([
    loadListWithCachedFallback(context, () => api.listCameras().then((response) => response.items), readCachedCameras),
    loadListWithCachedFallback(context, () => api.listLenses().then((response) => response.items), readCachedLenses),
    loadFiltersForForm(context),
    loadListWithCachedFallback(context, () => api.listFilmStocks().then((response) => response.items), readCachedFilmStocks),
    loadListWithCachedFallback(context, () => api.listFilmHolders().then((response) => response.items), readCachedFilmHolders),
    loadListWithCachedFallback(context, () => api.listRolls().then((response) => response.items), readCachedRolls),
  ]);

  return {
    cameras,
    lenses,
    filters: filtersResult.filters,
    films,
    filmHolders,
    rolls,
    filtersLoaded: filtersResult.filtersLoaded,
    filtersLoadError: filtersResult.filtersLoadError,
  };
}

export async function loadRecentPhotographsForCamera(context: OfflineReadContext, cameraId: string): Promise<Photograph[]> {
  if (isOffline(context) && context.user) {
    return (await readCachedPhotographs(context.user)).filter((photo) => photo.camera_id === cameraId);
  }

  try {
    return (await api.listPhotographs({ camera_id: cameraId, limit: 100 })).items;
  } catch {
    return (await readCachedPhotographs(context.user)).filter((photo) => photo.camera_id === cameraId);
  }
}

async function loadPhotographForEdit(context: OfflineReadContext, id: string) {
  if (isOffline(context) && context.user) return readCachedPhotograph(context.user, id);

  try {
    return await api.getPhotograph(id);
  } catch (error) {
    if (!context.user) throw error;
    const cached = await readCachedPhotograph(context.user, id);
    if (cached) return cached;
    throw error;
  }
}

async function loadPhotographImagesForEdit(context: OfflineReadContext, id: string) {
  if (isOffline(context) && context.user) return readCachedPhotographImages(context.user, id);

  try {
    return (await api.listPhotographImages(id)).items;
  } catch {
    return context.user ? readCachedPhotographImages(context.user, id) : [];
  }
}

export async function loadPhotographEditResources(context: OfflineReadContext, id: string): Promise<PhotographEditResourceSet> {
  const [photograph, images, resources] = await Promise.all([
    loadPhotographForEdit(context, id),
    loadPhotographImagesForEdit(context, id),
    loadPhotoLogResources(context),
  ]);

  if (!photograph) {
    throw new Error(isOffline(context)
      ? "This photograph is not cached for offline editing."
      : "Photograph not found.");
  }

  return {
    ...resources,
    photograph,
    images,
  };
}

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
