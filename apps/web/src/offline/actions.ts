import { api } from "../api/client";
import type { FilmHolder, Photograph, PhotographWritePayload, Roll, RollWritePayload, User } from "../api/client";
import {
  queueOfflineFilmHolderAction,
  queueOfflinePhotographUpdate,
  queueOfflineRollAction,
  queueOfflineRollCreate,
} from "./sync";

export interface OfflineActionContext {
  transportStatus: string;
  user: User | null;
}

function getOfflineUser(context: OfflineActionContext) {
  return context.transportStatus === "offline" ? context.user : null;
}

export function createRollForConnectivity(
  context: OfflineActionContext,
  payload: RollWritePayload & { name: string },
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineRollCreate(user, payload) : api.createRoll(payload);
}

export function updatePhotographForConnectivity(
  context: OfflineActionContext,
  photograph: Photograph | null,
  photographId: string,
  payload: PhotographWritePayload,
) {
  const user = getOfflineUser(context);
  if (!user) return api.updatePhotograph(photographId, payload);
  if (!photograph) throw new Error("This photograph is not available in the offline cache.");
  return queueOfflinePhotographUpdate(user, photograph, payload);
}

export function loadFilmHolderForConnectivity(
  context: OfflineActionContext,
  holder: FilmHolder | null,
  holderId: string,
  payload: { film_id: string; notes?: string | null },
) {
  const user = getOfflineUser(context);
  if (!user) return api.loadFilmHolder(holderId, payload);
  if (!holder) throw new Error("This holder is not cached for offline loading.");
  return queueOfflineFilmHolderAction(user, holder, "load", payload);
}

export function unloadFilmHolderForConnectivity(
  context: OfflineActionContext,
  holder: FilmHolder,
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineFilmHolderAction(user, holder, "unload") : api.unloadFilmHolder(holder.id);
}

export function processFilmHolderLoadForConnectivity(
  context: OfflineActionContext,
  holder: FilmHolder,
  payload?: { development_profile_id?: string | null; notes?: string | null },
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineFilmHolderAction(user, holder, "process", payload) : api.processFilmHolderLoad(holder.id, payload);
}

export function undoFilmHolderExposureForConnectivity(
  context: OfflineActionContext,
  holder: FilmHolder,
  payload?: { clear_photograph_holder?: boolean },
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineFilmHolderAction(user, holder, "undo", payload) : api.undoFilmHolderExposure(holder.id, payload);
}

export function finishRollForConnectivity(
  context: OfflineActionContext,
  roll: Roll,
  payload?: { finished_at?: string | null },
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineRollAction(user, roll, "finish", payload) : api.finishRoll(roll.id, payload);
}

export function processRollForConnectivity(
  context: OfflineActionContext,
  roll: Roll,
  payload?: {
    processed_at?: string | null;
    developed_at?: string | null;
    development_profile_id?: string | null;
    development_notes?: string | null;
  },
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineRollAction(user, roll, "process", payload) : api.processRoll(roll.id, payload);
}

export function reopenRollForConnectivity(
  context: OfflineActionContext,
  roll: Roll,
) {
  const user = getOfflineUser(context);
  return user ? queueOfflineRollAction(user, roll, "reopen") : api.reopenRoll(roll.id);
}

