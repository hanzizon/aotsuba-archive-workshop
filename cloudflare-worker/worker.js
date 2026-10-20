const ALLOWED_ORIGIN = "https://hanzizon.github.io";
const REPO = "hanzizon/aotsuba-archive-workshop";
const BRANCH = "main";
const SESSION_TTL = 3 * 60 * 60;
const FILES = {
  posts: "data/posts.json",
  series: "data/series.json"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      const methods = url.pathname === "/login" ? ["POST"] :
        /^\/data\/(posts|series)$/.test(url.pathname) ? ["GET","PUT"] :
        url.pathname === "/health" ? ["GET"] : [];
      const headers = (request.headers.get("Access-Control-Request-Headers") || "")
        .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      if (request.headers.get("Origin") !== ALLOWED_ORIGIN ||
          !methods.includes(request.headers.get("Access-Control-Request-Method")) ||
          headers.some(header => !["content-type","authorization"].includes(header))) {
        return json({ ok: false, error: "preflight_denied" }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.headers.has("Origin") && request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "origin_denied" }, 403, cors);
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD || !validSecret(env.SESSION_SECRET) || !env.LOGIN_LIMITER) {
          return json({ ok: false, error: "login_unavailable" }, 503, cors);
        }
        // Cloudflare supplies this header. Never use caller-supplied X-Forwarded-For.
        const ip = request.headers.get("CF-Connecting-IP");
        if (!ip) return json({ ok: false, error: "login_unavailable" }, 503, cors);
        const limiter = env.LOGIN_LIMITER.get(env.LOGIN_LIMITER.idFromName("admin-login-v1"));
        let limit;
        try {
          const response = await limiter.fetch("https://limiter/check", {
            method: "POST", body: await hmac(ip, env.SESSION_SECRET)
          });
          if (!response.ok) throw new Error("limiter_unavailable");
          limit = await response.json();
          if (typeof limit.allowed !== "boolean") throw new Error("limiter_invalid");
        } catch (_) {
          return json({ ok: false, error: "login_unavailable" }, 503, cors);
        }
        if (!limit.allowed) return json({ ok: false, error: "rate_limited" }, 429,
          { ...cors, "Retry-After": String(limit.retryAfter) });
        const body = await request.json().catch(() => ({}));
        if (typeof body?.password !== "string" || !body.password ||
            !timingSafeEqual(await hmac(body.password, env.SESSION_SECRET),
              await hmac(env.ADMIN_PASSWORD, env.SESSION_SECRET))) {
          return json({ ok: false, error: "invalid_password" }, 401, cors);
        }
        const token = await createSessionToken(env.SESSION_SECRET);
        return json({ ok: true, token, expiresIn: SESSION_TTL }, 200, cors);
      }

      const match = url.pathname.match(/^\/data\/(posts|series)$/);
      if (match) {
        const kind = match[1];
        const path = FILES[kind];

        if (request.method === "GET") {
          const file = await githubReadFile(env.GITHUB_TOKEN, path);
          return json({ ok: true, data: JSON.parse(file.text || "[]") }, 200, cors);
        }

        if (request.method === "PUT") {
          const auth = request.headers.get("Authorization") || "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
          if (!token || !(await verifySessionToken(token, env.SESSION_SECRET))) {
            return json({ ok: false, error: "unauthorized" }, 401, cors);
          }

          const payload = await request.json();
          if (!Array.isArray(payload)) {
            return json({ ok: false, error: "payload_must_be_array" }, 400, cors);
          }

          await githubWriteFile(
            env.GITHUB_TOKEN,
            path,
            JSON.stringify(payload, null, 2) + "\n",
            `Update ${kind} from Aotsuba Archive`
          );
          return json({ ok: true }, 200, cors);
        }
      }

      return json({ ok: false, error: "not_found" }, 404, cors);
    } catch (err) {
      console.error("Archive request failed");
      return json({ ok: false, error: "server_error" }, 500, cors);
    }
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After",
    "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    }
  });
}

async function githubReadFile(token, path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: githubHeaders(token)
  });
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  const text = decodeBase64Utf8((data.content || "").replace(/\n/g, ""));
  return { text, sha: data.sha };
}

async function githubWriteFile(token, path, text, message) {
  const current = await githubReadFile(token, path);
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(text),
      sha: current.sha,
      branch: BRANCH
    })
  });
  if (!res.ok) {
    throw new Error(`GitHub write failed: ${res.status}`);
  }
}

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "aotsuba-archive-worker"
  };
}

async function createSessionToken(secret) {
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    nonce: crypto.randomUUID()
  };
  const body = base64Url(JSON.stringify(payload));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

async function verifySessionToken(token, secret) {
  if (!validSecret(secret) || token.length > 2048 || token.split(".").length !== 2) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(body));
    const now = Math.floor(Date.now() / 1000);
    return Number.isInteger(payload.iat) && Number.isInteger(payload.exp) &&
      payload.iat <= now && payload.exp > now && payload.exp > payload.iat &&
      payload.exp - payload.iat <= SESSION_TTL;
  } catch {
    return false;
  }
}

function validSecret(secret) {
  return typeof secret === "string" && secret.length >= 32;
}

// One globally addressed object serializes attempts from every Worker instance.
// SQLite persists counters through eviction/restarts; no eventually consistent KV.
export class LoginLimiter {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, at INTEGER NOT NULL)");
  }
  async fetch(request) {
    const ip = await request.text();
    const now = Date.now(), windowMs = 15 * 60 * 1000;
    const result = this.storage.transactionSync(() => {
      const sql = this.storage.sql;
      sql.exec("DELETE FROM attempts WHERE at <= ?", now - windowMs);
      const rows = [...sql.exec("SELECT ip, at FROM attempts ORDER BY at")];
      const own = rows.filter(row => row.ip === ip);
      if (rows.length >= 50 || own.length >= 5) {
        const until = Math.max(rows.length >= 50 ? rows[0].at : 0,
          own.length >= 5 ? own[0].at : 0) + windowMs;
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((until - now) / 1000)) };
      }
      sql.exec("INSERT INTO attempts (ip, at) VALUES (?, ?)", ip, now);
      return { allowed: true };
    });
    return json(result);
  }
}

async function hmac(input, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64UrlBytes(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64Url(text) {
  return base64UrlBytes(new TextEncoder().encode(text));
}

function base64UrlBytes(bytes) {
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
