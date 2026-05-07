import { useEffect, useState } from "react";
import { api, type DevelopmentProfile, type FilmStockType } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { readCachedDevelopmentProfiles } from "../offline/cache";

export interface UseBtzsDevelopmentProfilesResult {
  profiles: DevelopmentProfile[];
  loading: boolean;
  error: string | null;
}

export function useBtzsDevelopmentProfiles(
  filmStockId: string | null | undefined,
  filmStockType: FilmStockType | null | undefined,
): UseBtzsDevelopmentProfilesResult {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<DevelopmentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filmStockId || filmStockType !== "bw") {
      setProfiles([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    api.listDevelopmentProfiles(filmStockId)
      .then((response) => {
        if (!active) return;
        setProfiles(response.items.filter((profile) => profile.type === "btzs" || profile.type === "simple"));
      })
      .catch(async (err) => {
        if (!active) return;
        const cachedProfiles = await readCachedDevelopmentProfiles(user, filmStockId);
        if (!active) return;
        const cachedMeteringProfiles = cachedProfiles.filter((profile) => profile.type === "btzs" || profile.type === "simple");
        setProfiles(cachedMeteringProfiles);
        setError(cachedMeteringProfiles.length > 0 || user
          ? null
          : err instanceof Error ? err.message : "Failed to load development profiles.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filmStockId, filmStockType, user]);

  return { profiles, loading, error };
}
