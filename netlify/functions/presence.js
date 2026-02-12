export default async (req) => {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return new Response(JSON.stringify({ count: 0, error: "Missing env vars" }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        status: 200,
      });
    }

    const ip =
      req.headers.get("x-nf-client-connection-ip") ||
      req.headers.get("x-forwarded-for") ||
      "anon";
    const ua = req.headers.get("user-agent") || "ua";
    const visitorId = `${ip}-${hash(ua)}`.slice(0, 120);

    const now = Date.now();
    const windowMs = 30000; // 30s
    const zsetKey = "presence:viewers";

    await redis(url, token, ["ZADD", zsetKey, now.toString(), visitorId]);

    const cutoff = now - windowMs;
    await redis(url, token, ["ZREMRANGEBYSCORE", zsetKey, "0", cutoff.toString()]);

    const countRes = await redis(url, token, ["ZCARD", zsetKey]);
    const count = Number(countRes?.result ?? 0);

    return new Response(JSON.stringify({ count }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ count: 0 }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      status: 200,
    });
  }
};

async function redis(baseUrl, token, commandArr) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commandArr),
  });
  return res.json();
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h).toString(36);
}
