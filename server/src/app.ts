import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AuthService } from "./auth/auth-service.js";
import { createAuthRouter } from "./auth/router.js";
import type { PoolService } from "./pools/pool-service.js";
import type { MembershipService } from "./memberships/membership-service.js";
import { createPoolsRouter } from "./pools/router.js";
import type { DepositService } from "./deposits/deposit-service.js";
import { createDepositsRouter } from "./deposits/router.js";
import type { SpendService } from "./spends/spend-service.js";
import { createSpendsRouter } from "./spends/router.js";
import type { ReimbursementService } from "./reimbursements/reimbursement-service.js";
import { createReimbursementsRouter } from "./reimbursements/router.js";
import type { LedgerService } from "./ledger/ledger-service.js";
import { createLedgerRouter } from "./ledger/router.js";
import type { ClosureService } from "./closure/closure-service.js";
import { createClosureRouter } from "./closure/router.js";

export interface AppDependencies {
  authService: AuthService;
  poolService: PoolService;
  membershipService: MembershipService;
  depositService: DepositService;
  spendService: SpendService;
  reimbursementService: ReimbursementService;
  ledgerService: LedgerService;
  closureService: ClosureService;
  jwtSecret: string;
}

export function createApp({
  authService,
  poolService,
  membershipService,
  depositService,
  spendService,
  reimbursementService,
  ledgerService,
  closureService,
  jwtSecret,
}: AppDependencies): Express {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter(authService, jwtSecret));
  app.use("/pools", createPoolsRouter(poolService, membershipService, jwtSecret));
  app.use("/pools", createDepositsRouter(depositService, jwtSecret));
  app.use("/pools", createSpendsRouter(spendService, jwtSecret));
  app.use("/pools", createReimbursementsRouter(reimbursementService, jwtSecret));
  app.use("/pools", createLedgerRouter(ledgerService, jwtSecret));
  app.use("/pools", createClosureRouter(closureService, jwtSecret));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
