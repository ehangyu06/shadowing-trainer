export function resourceUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
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
