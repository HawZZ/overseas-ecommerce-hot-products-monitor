import dns from "node:dns/promises";

const MAX_BYTES = 750_000;
function privateIp(address) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:)/iu.test(address);
}
export async function validateSourceUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("invalid_source_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === "1688.com" || url.hostname.endsWith(".1688.com"))) throw new Error("invalid_source_url");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error("unsafe_source_url");
  return url;
}
export async function inspect1688(rawUrl) {
  let url = await validateSourceUrl(rawUrl);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 title-research", Accept: "text/html" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { url = await validateSourceUrl(new URL(response.headers.get("location"), url).href); continue; }
    if (!response.ok) throw new Error("source_unavailable");
    const reader = response.body?.getReader(); let text = ""; let size = 0;
    while (reader) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw new Error("source_too_large"); text += new TextDecoder().decode(value, { stream: true }); }
    const meta = (name) => new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "iu").exec(text)?.[1] || "";
    const title = meta("og:title") || /<title[^>]*>([^<]+)<\/title>/iu.exec(text)?.[1] || "";
    const description = meta("description") || meta("og:description");
    if (!title || /login|登入|請登錄|請登录/iu.test(`${title} ${description}`)) return { status: "needs-input", facts: {}, message: "來源需要登入或公開資料不足，請手動填寫商品事實。" };
    return { status: "needs-confirmation", facts: { productName: title.replace(/[-_|].*$/u, "").trim(), description: description.trim(), sourceUrl: url.href }, message: "僅擷取公開標題與描述；請確認或補充商品事實。" };
  }
  throw new Error("source_redirect_limit");
}
