import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AuthService } from "./auth/auth-service.js";
import { createAuthRouter } from "./auth/router.js";
import type { PoolService } from "./pools/pool-service.js";
import type { MembershipService } from "./memberships/membership-service.js";
import { createPoolsRouter } from "./pools/router.js";
import type { DepositService } from "./deposits/deposit-service.js";
import { createDepositsRouter } from "./deposits/router.js";

export interface AppDependencies {
  authService: AuthService;
  poolService: PoolService;
  membershipService: MembershipService;
  depositService: DepositService;
  jwtSecret: string;
}

export function createApp({
  authService,
  poolService,
  membershipService,
  depositService,
  jwtSecret,
}: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter(authService, jwtSecret));
  app.use("/pools", createPoolsRouter(poolService, membershipService, jwtSecret));
  app.use("/pools", createDepositsRouter(depositService, jwtSecret));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
