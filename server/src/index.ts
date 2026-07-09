import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { PrismaUserRepository } from "./auth/prisma-user-repository.js";
import { PrismaOtpStore } from "./auth/prisma-otp-store.js";
import { ConsoleOtpSender } from "./auth/console-otp-sender.js";

const authService = new AuthService({
  userRepository: new PrismaUserRepository(prisma),
  otpStore: new PrismaOtpStore(prisma),
  otpSender: new ConsoleOtpSender(),
});

const app = createApp({ authService, jwtSecret: env.JWT_SECRET });

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pool-pay-server listening on :${port}`);
});
