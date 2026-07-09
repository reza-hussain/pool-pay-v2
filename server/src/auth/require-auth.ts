import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function requireAuth(jwtSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (typeof payload === "string" || !payload.sub) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }
      req.userId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
