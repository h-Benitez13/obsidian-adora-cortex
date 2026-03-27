export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
}

export const Platform = {
  isMacOS: process.platform === "darwin",
  isWin: process.platform === "win32",
};

export async function requestUrl(params: RequestUrlParam): Promise<RequestUrlResponse> {
  const headers: Record<string, string> = { ...params.headers };
  if (params.contentType && !headers["Content-Type"]) {
    headers["Content-Type"] = params.contentType;
  }

  const resp = await fetch(params.url, {
    method: params.method || "GET",
    headers,
    body: params.body,
  });

  const text = await resp.text();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }

  const responseHeaders: Record<string, string> = {};
  resp.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: resp.status,
    headers: responseHeaders,
    text,
    json,
  };
}

// ── Stubs for Obsidian types used by src/ modules at build time ──
// When esbuild aliases "obsidian" → this file, these satisfy type imports.

export class TFile {
  path: string = "";
  basename: string = "";
  extension: string = "";
}

export class App {}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
