export function resourceUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

export function isLocalMediaHost() {
  const host = window.location.hostname;
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.endsWith(".local") ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host)
  );
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) throw new Error("not json");
  return res.json();
}

export async function fetchJsonIfOk(url, options = {}) {
  try {
    return await fetchJson(url, options);
  } catch {
    return null;
  }
}

export async function urlLooksReachable(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}
