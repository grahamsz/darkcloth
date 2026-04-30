import { Context, Next } from "hono";
import { jwt } from "hono/jwt";
import { Env } from "../index";

export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  });
  return jwtMiddleware(c, next);
};

export const getUserId = (c: Context) => {
  const payload = c.get("jwtPayload");
  return payload.sub as string;
};
