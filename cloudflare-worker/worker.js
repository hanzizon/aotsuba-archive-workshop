const ALLOWED_ORIGIN = "https://hanzizon.github.io";
const REPO = "hanzizon/aotsuba-archive-workshop";
const BRANCH = "main";
const SESSION_TTL = 3 * 60 * 60;
const AUDIO_LIMIT = 8 * 1024 * 1024;
const AUDIO_PATH = /^\/audio\/([a-f0-9]{64})\.mp3$/;
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
        url.pathname === "/audio" ? ["POST"] : AUDIO_PATH.test(url.pathname) ? ["GET","HEAD"] :
        /^\/data\/(posts|series)$/.test(url.pathname) ? ["GET","PUT"] :
        url.pathname === "/health" ? ["GET"] : [];
      const headers = (request.headers.get("Access-Control-Request-Headers") || "")
        .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      if (request.headers.get("Origin") !== ALLOWED_ORIGIN ||
          !methods.includes(request.headers.get("Access-Control-Request-Method")) ||
          headers.some(header => !["content-type","authorization","range"].includes(header))) {
        return json({ ok: false, error: "preflight_denied" }, 403, cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.headers.has("Origin") && request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "origin_denied" }, 403, cors);
    }

    try {
      if (url.pathname === "/audio" && request.method === "POST") {
        const authorization = request.headers.get("Authorization") || "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!await verifySessionToken(token, env.SESSION_SECRET)) return json({ok:false,error:"unauthorized"},401,cors);
        if (request.headers.get("Content-Type") !== "audio/mpeg") return json({ok:false,error:"mp3_required"},415,cors);
        const bytes = await boundedAudio(request);
        if (!bytes) return json({ok:false,error:"audio_too_large"},413,cors);
        // Container signature check; audio is served only as inert audio/mpeg with nosniff.
        if (bytes.length < 4 || !(bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51 ||
          bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0 &&
          (bytes[2] & 0xf0) !== 0 && (bytes[2] & 0xf0) !== 0xf0)) return json({ok:false,error:"mp3_required"},415,cors);
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n=>n.toString(16).padStart(2,"0")).join("");
        const endpoint = `https://api.github.com/repos/${REPO}/contents/media/audio/${hash}.mp3`;
        const existing = await fetch(`${endpoint}?ref=${BRANCH}`,{headers:githubHeaders(env.GITHUB_TOKEN)});
        if (existing.status === 404) {
          let binary = "";
          for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
          const saved = await fetch(endpoint,{method:"PUT",headers:{...githubHeaders(env.GITHUB_TOKEN),"Content-Type":"application/json"},body:JSON.stringify({message:"Add archive audio",branch:BRANCH,content:btoa(binary)})});
          if (!saved.ok) {
            const retry = await fetch(`${endpoint}?ref=${BRANCH}`,{headers:githubHeaders(env.GITHUB_TOKEN)});
            if (!retry.ok) throw new Error("audio_write_failed");
          }
        } else if (!existing.ok) throw new Error("audio_read_failed");
        return json({ok:true,url:`${url.origin}/audio/${hash}.mp3`},200,cors);
      }
      const audio = url.pathname.match(AUDIO_PATH);
      if (audio && ["GET","HEAD"].includes(request.method)) {
        const upstream = await fetch(`https://api.github.com/repos/${REPO}/contents/media/audio/${audio[1]}.mp3?ref=${BRANCH}`,{headers:{...githubHeaders(env.GITHUB_TOKEN),Accept:"application/vnd.github.raw+json"}});
        if (upstream.status === 404) return json({ok:false,error:"not_found"},404,cors);
        if (!upstream.ok) throw new Error("audio_read_failed");
        const bytes = await boundedAudio(upstream);
        if (!bytes || !bytes.length) throw new Error("invalid_audio");
        const headers = {...cors,"Content-Type":"audio/mpeg","X-Content-Type-Options":"nosniff","Cache-Control":"public, max-age=31536000, immutable","Accept-Ranges":"bytes","Content-Length":String(bytes.length)};
        let start=0,end=bytes.length-1,status=200;
        const range=request.headers.get("Range");
        if (range && request.method === "GET") {
          const parts=/^bytes=(\d*)-(\d*)$/.exec(range);
          if (parts && (parts[1] || parts[2])) {
            start=parts[1]?Number(parts[1]):Math.max(0,bytes.length-Number(parts[2]));
            end=parts[1] && parts[2]?Math.min(Number(parts[2]),end):end;
          } else start=bytes.length;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=bytes.length) return new Response(null,{status:416,headers:{...headers,"Content-Length":"0","Content-Range":`bytes */${bytes.length}`}});
          status=206; headers["Content-Range"]=`bytes ${start}-${end}/${bytes.length}`; headers["Content-Length"]=String(end-start+1);
        }
        return new Response(request.method === "HEAD"?null:bytes.slice(start,end+1),{status,headers});
      }
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After, Content-Range, Accept-Ranges",
    "Vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  };
}

async function boundedAudio(message) {
  if (Number(message.headers.get("Content-Length")) > AUDIO_LIMIT) return null;
  const reader=message.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks=[]; let size=0;
  while (true) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.length;
    if (size>AUDIO_LIMIT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  return bytes;
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
