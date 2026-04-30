import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { Env } from "../index";

type AuthPayload = {
  sub: string;
  [key: string]: unknown;
};

export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  if (!c.env.JWT_SECRET) {
    return c.json({ error: "Server authentication is not configured" }, 500);
  }

  const authorization = c.req.header("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  try {
    const payload = await verify(match[1], c.env.JWT_SECRET, "HS256");
    if (typeof payload.sub !== "string" || !payload.sub) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    c.set("jwtPayload", payload as AuthPayload);
  } catch {
    return c.json({ error: "Not authenticated" }, 401);
  }

  return next();
};

export const getUserId = (c: Context) => {
  const payload = c.get("jwtPayload") as AuthPayload;
  return payload.sub;
};
