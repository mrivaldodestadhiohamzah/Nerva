import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-for-nerva";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.SMTP_EMAIL;
delete process.env.SMTP_PASSWORD;

const { app } = await import("../server.js");
const { authenticateToken } = await import("../middleware/auth.js");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test("register returns a local development token when Supabase is not configured", async () => {
  const { status, body } = await postJson("/api/auth/register", {
    name: "Pengguna Test",
    email: "test@example.com",
    password: "Password1!",
  });

  assert.equal(status, 201);
  assert.equal(body.user.email, "test@example.com");
  assert.ok(body.token);
});

test("login returns a local development token when Supabase is not configured", async () => {
  const { status, body } = await postJson("/api/auth/login", {
    email: "test@example.com",
    password: "Password1!",
  });

  assert.equal(status, 200);
  assert.equal(body.user.email, "test@example.com");
  assert.ok(body.token);
});

test("forgot password request validates email before service access", async () => {
  const { status, body } = await postJson("/api/forgot-password/request", {
    email: "not-an-email",
  });

  assert.equal(status, 400);
  assert.match(body.message || body.error, /email/i);
});

test("reset password requires a verified reset token", async () => {
  const { status, body } = await postJson("/api/forgot-password/reset", {
    email: "test@example.com",
    newPassword: "Password2!",
  });

  assert.equal(status, 400);
  assert.match(body.message || body.error, /token/i);
});

test("verify reset code rejects malformed codes", async () => {
  const { status, body } = await postJson("/api/forgot-password/verify", {
    email: "test@example.com",
    code: "12",
  });

  assert.equal(status, 400);
  assert.match(body.message || body.error, /kode/i);
});

test("auth middleware rejects missing and invalid bearer tokens", async () => {
  const missingResponse = createMockResponse();
  authenticateToken({ headers: {} }, missingResponse, () => {
    throw new Error("next should not be called for missing token");
  });

  assert.equal(missingResponse.statusCode, 401);

  const invalidResponse = createMockResponse();
  authenticateToken(
    { headers: { authorization: "Bearer invalid-token" } },
    invalidResponse,
    () => {
      throw new Error("next should not be called for invalid token");
    }
  );

  assert.equal(invalidResponse.statusCode, 403);
});

test("auth middleware accepts a valid token", async () => {
  const req = {
    headers: {
      authorization: `Bearer ${jwt.sign(
        { user_id: "user_1", email: "test@example.com", name: "Pengguna Test" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      )}`,
    },
  };
  const response = createMockResponse();
  let nextCalled = false;

  authenticateToken(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.user_id, "user_1");
});

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}
