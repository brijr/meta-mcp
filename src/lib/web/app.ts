import type { WebMiddleware } from "xmcp/cloudflare";
import type { AuthContext } from "../auth/context";
import { normalizeAppError } from "../errors";
import { beginMetaOAuth } from "../oauth/meta-oauth";
import { getMetaConnectionByWorkspaceId } from "../storage/connection-repo";
import { createMetaToolContext } from "../tools/handler";
import { getAdAccountsService } from "../../services/account-service";
import {
  clearAppSessionCookie,
  createAppSessionCookie,
  createDefaultAppSession,
  getAppSession,
  getAppUiPassword,
  requireAppSession,
  verifyAppUiPassword,
} from "./session";

interface FlashMessage {
  tone: "success" | "error" | "info";
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(html: string, init?: ResponseInit): Response {
  return new Response(html, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function errorJsonResponse(error: unknown): Response {
  const normalized = normalizeAppError(error);
  return jsonResponse(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    },
    {
      status: normalized.status,
    }
  );
}

function toAuthContext(session: { userId: string; workspaceId: string }): AuthContext {
  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    roles: ["admin"],
    token: "app-session",
    scopes: ["app"],
  };
}

function readFlashMessage(url: URL): FlashMessage | null {
  const authState = url.searchParams.get("meta_oauth");
  if (authState === "connected") {
    return {
      tone: "success",
      text: "Meta account connected. You can load ad accounts now.",
    };
  }

  if (authState === "error") {
    return {
      tone: "error",
      text: url.searchParams.get("message") || "Meta OAuth did not complete.",
    };
  }

  const loginError = url.searchParams.get("login_error");
  if (loginError === "invalid") {
    return {
      tone: "error",
      text: "Incorrect password.",
    };
  }

  return null;
}

function renderLoginPage(url: URL, missingPassword: boolean): string {
  const flash = readFlashMessage(url);
  const flashMarkup = flash
    ? `<div class="banner ${flash.tone}">${escapeHtml(flash.text)}</div>`
    : "";
  const setupMarkup = missingPassword
    ? `<div class="banner info">Set the <code>APP_UI_PASSWORD</code> Worker secret, then reload this page.</div>`
    : "";
  const formMarkup = missingPassword
    ? ""
    : `
      <form class="stack" method="post" action="/app/login">
        <label class="label" for="password">Admin password</label>
        <input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
        <button class="button" type="submit">Open Admin App</button>
      </form>
    `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Meta MCP Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe7;
        --panel: rgba(255, 252, 247, 0.92);
        --text: #1e1b18;
        --muted: #6b625b;
        --line: rgba(30, 27, 24, 0.12);
        --accent: #0f766e;
        --accent-strong: #115e59;
        --error: #b42318;
        --success: #166534;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 32%),
          radial-gradient(circle at bottom right, rgba(193, 93, 63, 0.18), transparent 36%),
          linear-gradient(180deg, #efe6db 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }

      .card {
        width: min(520px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 24px 80px rgba(28, 25, 23, 0.08);
        backdrop-filter: blur(10px);
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 0.95;
      }

      p {
        margin: 0 0 24px;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.5;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .label {
        font-size: 0.95rem;
        color: var(--muted);
      }

      .input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px 16px;
        font: inherit;
        background: rgba(255, 255, 255, 0.72);
      }

      .button {
        border: 0;
        border-radius: 999px;
        padding: 14px 18px;
        font: inherit;
        color: white;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        cursor: pointer;
      }

      .banner {
        border-radius: 14px;
        padding: 12px 14px;
        margin: 0 0 16px;
      }

      .banner.success { background: rgba(22, 101, 52, 0.1); color: var(--success); }
      .banner.error { background: rgba(180, 35, 24, 0.1); color: var(--error); }
      .banner.info { background: rgba(15, 118, 110, 0.1); color: var(--accent-strong); }
      code { font-family: "SFMono-Regular", Menlo, monospace; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Meta MCP</h1>
      <p>Sign into the admin page, connect your Meta account, and use the Worker from one place.</p>
      ${flashMarkup}
      ${setupMarkup}
      ${formMarkup}
    </main>
  </body>
</html>`;
}

function renderAppPage(url: URL, session: { userId: string; workspaceId: string }): string {
  const flash = readFlashMessage(url);
  const flashMarkup = flash
    ? `<div class="banner ${flash.tone}">${escapeHtml(flash.text)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Meta MCP Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --panel: rgba(255, 252, 248, 0.92);
        --text: #1f1a16;
        --muted: #695f56;
        --line: rgba(31, 26, 22, 0.12);
        --accent: #0f766e;
        --accent-strong: #115e59;
        --accent-soft: rgba(15, 118, 110, 0.12);
        --error: #b42318;
        --success: #166534;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(193, 93, 63, 0.18), transparent 35%),
          linear-gradient(180deg, #efe5d9 0%, var(--bg) 100%);
        padding: 28px 16px 40px;
      }

      .shell {
        width: min(1100px, 100%);
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }

      .hero, .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 24px 80px rgba(28, 25, 23, 0.08);
        backdrop-filter: blur(12px);
      }

      .hero {
        padding: 28px;
        display: grid;
        gap: 18px;
      }

      .kicker {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.78rem;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.4rem, 6vw, 4.5rem);
        line-height: 0.9;
      }

      .hero p {
        margin: 0;
        max-width: 50rem;
        color: var(--muted);
        line-height: 1.5;
      }

      .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .pill {
        border-radius: 999px;
        border: 1px solid var(--line);
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.56);
        color: var(--muted);
        font-size: 0.92rem;
      }

      .grid {
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .panel {
        padding: 22px;
      }

      .panel h2 {
        margin: 0 0 8px;
        font-size: 1.3rem;
      }

      .panel p {
        margin: 0 0 18px;
        color: var(--muted);
        line-height: 1.5;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .button, .button-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 999px;
        padding: 12px 16px;
        font: inherit;
        text-decoration: none;
        cursor: pointer;
      }

      .button {
        border: 0;
        color: white;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      }

      .button.secondary, .button-link.secondary {
        color: var(--text);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.64);
      }

      .banner {
        border-radius: 14px;
        padding: 12px 14px;
        margin: 0 0 16px;
      }

      .banner.success { background: rgba(22, 101, 52, 0.1); color: var(--success); }
      .banner.error { background: rgba(180, 35, 24, 0.1); color: var(--error); }
      .banner.info { background: var(--accent-soft); color: var(--accent-strong); }

      .status-box {
        border-radius: 18px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.58);
        border: 1px solid var(--line);
      }

      .status-box strong {
        display: block;
        margin-bottom: 6px;
      }

      pre {
        margin: 0;
        padding: 16px;
        background: #171411;
        color: #f7efe7;
        border-radius: 18px;
        overflow: auto;
        font-size: 0.86rem;
        line-height: 1.45;
        min-height: 220px;
      }

      @media (max-width: 720px) {
        .hero, .panel { border-radius: 20px; }
        .hero, .panel { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="kicker">Meta MCP Admin</div>
        <h1>Connect Meta and use the Worker from one screen.</h1>
        <p>This page is a thin admin shell on top of the same Worker APIs already powering OAuth and MCP. Use it to connect Meta, verify the linked user, and inspect ad accounts for the app workspace.</p>
        <div class="hero-meta">
          <div class="pill">user: ${escapeHtml(session.userId)}</div>
          <div class="pill">workspace: ${escapeHtml(session.workspaceId)}</div>
        </div>
      </section>
      <section class="grid">
        <section class="panel">
          <h2>Connection</h2>
          <p>Use the existing Meta OAuth flow, but start it from this page so the workspace context stays consistent.</p>
          ${flashMarkup}
          <div id="status" class="status-box">
            <strong>Loading connection status...</strong>
            <span>Please wait.</span>
          </div>
          <div class="actions" style="margin-top: 18px;">
            <a class="button-link" href="/app/connect">Connect Meta</a>
            <a class="button-link secondary" href="/app/logout">Log out</a>
          </div>
        </section>
        <section class="panel">
          <h2>Ad Accounts</h2>
          <p>Load the currently accessible ad accounts for this workspace. This calls the same account service the MCP tool uses.</p>
          <div class="actions">
            <button class="button" id="load-accounts" type="button">Load Ad Accounts</button>
          </div>
          <pre id="accounts-output">Waiting for a request.</pre>
        </section>
      </section>
    </main>
    <script>
      const statusNode = document.getElementById("status");
      const outputNode = document.getElementById("accounts-output");
      const loadButton = document.getElementById("load-accounts");

      function setStatus(message, detail, tone) {
        statusNode.innerHTML = "<strong>" + message + "</strong><span>" + detail + "</span>";
        statusNode.style.background =
          tone === "error" ? "rgba(180, 35, 24, 0.08)" :
          tone === "success" ? "rgba(22, 101, 52, 0.08)" :
          "rgba(255, 255, 255, 0.58)";
      }

      async function readJson(response) {
        const text = await response.text();
        return text ? JSON.parse(text) : {};
      }

      async function loadStatus() {
        const response = await fetch("/app/api/status", {
          headers: { accept: "application/json" }
        });
        const payload = await readJson(response);

        if (!response.ok) {
          setStatus("Unable to load status.", payload.error?.message || "Unexpected error.", "error");
          return null;
        }

        if (payload.connected) {
          const label = payload.connection?.graphUserName || payload.connection?.graphUserId || "Connected";
          setStatus("Meta is connected.", "Linked account: " + label, "success");
        } else {
          setStatus("No Meta account connected yet.", "Use the Connect Meta button to start OAuth.", "info");
        }

        return payload;
      }

      async function loadAdAccounts() {
        outputNode.textContent = "Loading ad accounts...";
        const response = await fetch("/app/api/ad-accounts", {
          headers: { accept: "application/json" }
        });
        const payload = await readJson(response);

        if (!response.ok) {
          outputNode.textContent = JSON.stringify(payload, null, 2);
          return;
        }

        outputNode.textContent = JSON.stringify(payload.items || [], null, 2);
      }

      loadButton.addEventListener("click", () => {
        void loadAdAccounts();
      });

      void loadStatus();
    </script>
  </body>
</html>`;
}

function renderErrorPage(error: unknown): string {
  const normalized = normalizeAppError(error);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Meta MCP Admin Error</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #f4efe6;
        color: #1f1a16;
        font-family: Georgia, "Times New Roman", serif;
      }
      .card {
        max-width: 560px;
        background: rgba(255, 252, 248, 0.92);
        border: 1px solid rgba(31, 26, 22, 0.12);
        border-radius: 24px;
        padding: 28px;
      }
      h1 { margin: 0 0 12px; }
      p { margin: 0 0 12px; color: #695f56; }
      code { font-family: "SFMono-Regular", Menlo, monospace; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Admin app error</h1>
      <p>${escapeHtml(normalized.message)}</p>
      <p><code>${escapeHtml(normalized.code)}</code></p>
    </main>
  </body>
</html>`;
}

export const appMiddleware: WebMiddleware = async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return Response.redirect(new URL("/app", url).toString(), 302);
  }

  if (!url.pathname.startsWith("/app")) {
    return undefined;
  }

  const isApiRoute = url.pathname.startsWith("/app/api/");

  try {
    if (url.pathname === "/app" && request.method === "GET") {
      const session = await getAppSession(request);
      if (!session) {
        return htmlResponse(renderLoginPage(url, !getAppUiPassword()));
      }

      return htmlResponse(renderAppPage(url, session));
    }

    if (url.pathname === "/app/login" && request.method === "POST") {
      const body = await request.text();
      const form = new URLSearchParams(body);
      const password = form.get("password") || "";

      if (!verifyAppUiPassword(password)) {
        return Response.redirect(new URL("/app?login_error=invalid", url).toString(), 302);
      }

      return new Response(null, {
        status: 302,
        headers: {
          location: new URL("/app", url).toString(),
          "set-cookie": await createAppSessionCookie(createDefaultAppSession()),
        },
      });
    }

    if (url.pathname === "/app/logout" && request.method === "GET") {
      return new Response(null, {
        status: 302,
        headers: {
          location: new URL("/app", url).toString(),
          "set-cookie": clearAppSessionCookie(),
        },
      });
    }

    if (url.pathname === "/app/connect" && request.method === "GET") {
      const session = await requireAppSession(request);
      return beginMetaOAuth(request, session, "/app");
    }

    if (url.pathname === "/app/api/status" && request.method === "GET") {
      const session = await requireAppSession(request);
      const connection = await getMetaConnectionByWorkspaceId(session.workspaceId);

      return jsonResponse({
        userId: session.userId,
        workspaceId: session.workspaceId,
        connected: !!connection,
        connection: connection
          ? {
              graphUserId: connection.graphUserId,
              graphUserName: connection.graphUserName,
              expiresAt: connection.expiresAt,
              lastValidatedAt: connection.lastValidatedAt,
              lastError: connection.lastError,
            }
          : null,
      });
    }

    if (url.pathname === "/app/api/ad-accounts" && request.method === "GET") {
      const session = await requireAppSession(request);
      const context = await createMetaToolContext(toAuthContext(session));
      const result = await getAdAccountsService({}, context);

      return jsonResponse({
        text: result.text,
        ...(result.data ?? {}),
      });
    }

    return isApiRoute
      ? jsonResponse({ error: { code: "not_found", message: "Not found." } }, { status: 404 })
      : htmlResponse(renderErrorPage(new Error("Not found.")), { status: 404 });
  } catch (error) {
    return isApiRoute
      ? errorJsonResponse(error)
      : htmlResponse(renderErrorPage(error), {
          status: normalizeAppError(error).status,
        });
  }
};
