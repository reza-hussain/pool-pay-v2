import jwt from "jsonwebtoken";

const SESSION_TTL = "30d";

export function signSessionToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: SESSION_TTL });
}
