import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AuthService } from "./auth/auth-service.js";
import { createAuthRouter } from "./auth/router.js";

export interface AppDependencies {
  authService: AuthService;
  jwtSecret: string;
}

export function createApp({ authService, jwtSecret }: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter(authService, jwtSecret));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
