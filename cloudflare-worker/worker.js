const ALLOWED_ORIGIN = "https://hanzizon.github.io";
const REPO = "hanzizon/aotsuba-archive-workshop";
const BRANCH = "main";
const FILES = {
  posts: "data/posts.json",
  series: "data/series.json"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.password || body.password !== env.ADMIN_PASSWORD) {
          return json({ ok: false, error: "invalid_password" }, 401, cors);
        }
        const token = await createSessionToken(env.SESSION_SECRET);
        return json({ ok: true, token, expiresIn: 43200 }, 200, cors);
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
      console.error(err);
      return json({ ok: false, error: "server_error" }, 500, cors);
    }
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Vary": "Origin"
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
    const detail = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${detail}`);
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
    exp: Math.floor(Date.now() / 1000) + 43200,
    nonce: crypto.randomUUID()
  };
  const body = base64Url(JSON.stringify(payload));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

async function verifySessionToken(token, secret) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(body));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
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
