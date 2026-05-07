import { useAuth } from "../contexts/AuthContext";
import { getBrowserTimeZone } from "../timezones";

export function usePreferredTimeZone() {
  const { user } = useAuth();
  return user?.default_timezone ?? getBrowserTimeZone();
}
