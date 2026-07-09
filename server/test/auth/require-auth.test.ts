import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireAuth } from "../../src/auth/require-auth.js";

const SECRET = "test-secret";

function makeApp() {
  const app = express();
  app.get("/protected", requireAuth(SECRET), (req, res) => {
    res.status(200).json({ userId: (req as express.Request & { userId?: string }).userId });
  });
  return app;
}

describe("requireAuth", () => {
  it("attaches userId and calls through for a valid token", async () => {
    const app = makeApp();
    const token = jwt.sign({ sub: "user_123" }, SECRET);

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user_123");
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const app = makeApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const app = makeApp();
    const res = await request(app).get("/protected").set("Authorization", "not-a-bearer-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const app = makeApp();
    const token = jwt.sign({ sub: "user_123" }, "wrong-secret");
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const app = makeApp();
    const token = jwt.sign({ sub: "user_123" }, SECRET, { expiresIn: -10 });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
