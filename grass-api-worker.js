// ============================================================
// Cloudflare Worker: grass-api
// Paste this entire file into the Worker editor on Cloudflare
// Make sure to bind KV namespace "GRASS_KV" in Worker settings
// ============================================================

const ADMIN_PASSWORD = "changeme123"; // ← CHANGE THIS

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for your frontend
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // POST /click — called when user clicks the block
    if (path === "/click" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const cf = request.cf || {};
      const city = cf.city || "Unknown";
      const region = cf.regionCode || cf.region || "";
      const country = cf.country || "";
      const location = [city, region].filter(Boolean).join(", ") + (country ? ` (${country})` : "");
      const now = new Date().toISOString();

      // Increment total clicks
      const totalRaw = await env.GRASS_KV.get("total_clicks");
      const total = parseInt(totalRaw || "0") + 1;
      await env.GRASS_KV.put("total_clicks", String(total));

      // Track unique users by IP (hashed for privacy)
      const ipKey = `ip_${await hashString(ip)}`;
      const seen = await env.GRASS_KV.get(ipKey);
      if (!seen) {
        await env.GRASS_KV.put(ipKey, "1", { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year
        const uniqueRaw = await env.GRASS_KV.get("unique_users");
        const unique = parseInt(uniqueRaw || "0") + 1;
        await env.GRASS_KV.put("unique_users", String(unique));
      }

      // Append visit log (keep last 500 entries)
      const logRaw = await env.GRASS_KV.get("visit_log");
      const log = logRaw ? JSON.parse(logRaw) : [];
      log.unshift({ time: now, location, isNew: !seen });
      if (log.length > 500) log.splice(500);
      await env.GRASS_KV.put("visit_log", JSON.stringify(log));

      return new Response(JSON.stringify({ total }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // GET /stats?password=xxx — admin dashboard data
    if (path === "/stats" && request.method === "GET") {
      const pw = url.searchParams.get("password");
      if (pw !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const total = parseInt((await env.GRASS_KV.get("total_clicks")) || "0");
      const unique = parseInt((await env.GRASS_KV.get("unique_users")) || "0");
      const logRaw = await env.GRASS_KV.get("visit_log");
      const log = logRaw ? JSON.parse(logRaw) : [];
      return new Response(JSON.stringify({ total, unique, log }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // GET /count — public click count (for the frontend display)
    if (path === "/count" && request.method === "GET") {
      const total = parseInt((await env.GRASS_KV.get("total_clicks")) || "0");
      return new Response(JSON.stringify({ total }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};

async function hashString(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
