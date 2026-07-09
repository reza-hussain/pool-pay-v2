import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { PrismaUserRepository } from "./auth/prisma-user-repository.js";
import { PrismaOtpStore } from "./auth/prisma-otp-store.js";
import { ConsoleOtpSender } from "./auth/console-otp-sender.js";
import { PoolService } from "./pools/pool-service.js";
import { PrismaPoolRepository } from "./pools/prisma-pool-repository.js";
import { MembershipService } from "./memberships/membership-service.js";
import { PrismaMembershipRepository } from "./memberships/prisma-membership-repository.js";

const authService = new AuthService({
  userRepository: new PrismaUserRepository(prisma),
  otpStore: new PrismaOtpStore(prisma),
  otpSender: new ConsoleOtpSender(),
});

const poolRepository = new PrismaPoolRepository(prisma);
const membershipRepository = new PrismaMembershipRepository(prisma);

const poolService = new PoolService({ poolRepository, membershipRepository });
const membershipService = new MembershipService({ poolRepository, membershipRepository });

const app = createApp({ authService, poolService, membershipService, jwtSecret: env.JWT_SECRET });

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pool-pay-server listening on :${port}`);
});
