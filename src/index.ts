export interface Env {
  MC_STATUS: KVNamespace;
  DISCORD_WEBHOOK_URL: string;
}

interface DiscordWebhookPayload {
  content?: string;
  type?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: string;
  }>;
  motd?: string;
  icon?: string;
}

interface ServerStatus {
  online: boolean;
  players: string[];
  playerCount: number;
  maxPlayers: number;
  lastUpdated: string;
  version: string;
  motd: string;
  icon: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      const payload: DiscordWebhookPayload = await request.json();

      if (payload.type === "status_update") {
        const status: ServerStatus = {
          online: false,
          players: [],
          playerCount: 0,
          maxPlayers: 40,
          lastUpdated: new Date().toISOString(),
          version: "1.21.1",
          motd: payload.motd || "A Minecraft Server",
          icon: payload.icon || "",
        };

        if (payload.embeds) {
          for (const embed of payload.embeds) {
            if (embed.title?.includes("Online")) {
              status.online = true;
            }
            if (embed.fields) {
              for (const field of embed.fields) {
                if (field.name === "Players") {
                  const match = field.value.match(/^(\d+)\/(\d+)$/);
                  if (match) {
                    status.playerCount = parseInt(match[1]);
                    status.maxPlayers = parseInt(match[2]);
                  }
                }
              }
            }
          }
        }

        await env.MC_STATUS.put("server_status", JSON.stringify(status));

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // DIからの通知（Discord転送 + KV更新）
      const status: ServerStatus = {
        online: true,
        players: [],
        playerCount: 0,
        maxPlayers: 40,
        lastUpdated: new Date().toISOString(),
        version: "1.21.1",
        motd: "A Minecraft Server",
        icon: "",
      };

      if (payload.embeds) {
        for (const embed of payload.embeds) {
          if (embed.title?.toLowerCase().includes("stop") ||
              embed.description?.toLowerCase().includes("stop")) {
            status.online = false;
          }
          if (embed.fields) {
            for (const field of embed.fields) {
              if (field.name.toLowerCase().includes("player")) {
                status.playerCount = parseInt(field.value) || 0;
              }
            }
          }
        }
      }

      await env.MC_STATUS.put("server_status", JSON.stringify(status));

      if (env.DISCORD_WEBHOOK_URL) {
        await fetch(env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /status
    if (url.pathname === "/status" && request.method === "GET") {
      const statusData = await env.MC_STATUS.get("server_status");
      const status: ServerStatus = statusData
        ? JSON.parse(statusData)
        : {
            online: false,
            players: [],
            playerCount: 0,
            maxPlayers: 40,
            lastUpdated: new Date().toISOString(),
            version: "1.21.1",
            motd: "A Minecraft Server",
            icon: "",
          };

      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET / - ステータスページ
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Minecraft Server Status</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      background: #16213e;
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .server-card {
      display: flex;
      padding: 16px;
      gap: 16px;
      align-items: flex-start;
    }
    .server-icon {
      width: 64px;
      height: 64px;
      border-radius: 4px;
      background: #0f3460;
      flex-shrink: 0;
      image-rendering: pixelated;
    }
    .server-icon img {
      width: 64px;
      height: 64px;
      image-rendering: pixelated;
    }
    .server-info {
      flex: 1;
      min-width: 0;
    }
    .motd {
      font-size: 1em;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .server-meta {
      font-size: 0.8em;
      color: #aaa;
    }
    .player-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .player-bar-fill {
      flex: 1;
      height: 4px;
      background: #0f3460;
      border-radius: 2px;
      overflow: hidden;
    }
    .player-bar-inner {
      height: 100%;
      background: #00c853;
      transition: width 0.5s;
      border-radius: 2px;
    }
    .player-count {
      font-size: 0.8em;
      color: #aaa;
      white-space: nowrap;
    }
    .status-line {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 0.8em;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot.online { background: #00c853; }
    .status-dot.offline { background: #ff1744; }
    .status-text { color: #aaa; }
    .ping { margin-left: auto; color: #aaa; }
    .address-bar {
      background: #0f3460;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: background 0.2s;
    }
    .address-bar:hover { background: #1a5276; }
    .address-text {
      font-family: monospace;
      font-size: 0.9em;
    }
    .copy-hint {
      font-size: 0.75em;
      color: #666;
    }
    .footer {
      padding: 8px 16px;
      text-align: center;
      color: #444;
      font-size: 0.75em;
    }
    .pulse {
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="server-card">
      <div class="server-icon" id="server-icon"></div>
      <div class="server-info">
        <div class="motd" id="motd">A Minecraft Server</div>
        <div class="server-meta">NeoForge 1.21.1</div>
        <div class="player-bar">
          <div class="player-bar-fill">
            <div class="player-bar-inner" id="player-bar" style="width: 0%"></div>
          </div>
          <span class="player-count" id="players">0/40</span>
        </div>
        <div class="status-line">
          <span class="status-dot offline" id="status-dot"></span>
          <span class="status-text" id="status-text">オフライン</span>
          <span class="ping" id="last-updated"></span>
        </div>
      </div>
    </div>
    <div class="address-bar" onclick="navigator.clipboard.writeText('mcserver.xitrus-jp.com')">
      <span class="address-text">mcserver.xitrus-jp.com</span>
      <span class="copy-hint">クリックでコピー</span>
    </div>
    <div class="footer"><span class="pulse">●</span> サーバー情報は5分間隔で更新・ページは1分ごとに自動更新</div>
  </div>
  <script>
    async function updateStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();

        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        const players = document.getElementById('players');
        const bar = document.getElementById('player-bar');
        const motd = document.getElementById('motd');
        const icon = document.getElementById('server-icon');
        const lastUpdated = document.getElementById('last-updated');

        if (data.online) {
          dot.className = 'status-dot online';
          text.textContent = 'オンライン';
        } else {
          dot.className = 'status-dot offline';
          text.textContent = 'オフライン';
        }

        players.textContent = data.playerCount + '/' + data.maxPlayers;
        bar.style.width = (data.maxPlayers > 0 ? (data.playerCount / data.maxPlayers * 100) : 0) + '%';
        motd.textContent = data.motd || 'A Minecraft Server';
        lastUpdated.textContent = new Date(data.lastUpdated).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        if (data.icon) {
          icon.innerHTML = '<img src="data:image/png;base64,' + data.icon + '" alt="Server Icon">';
        }
      } catch (e) {
        console.error('Status fetch failed', e);
      }
    }

    updateStatus();
    setInterval(updateStatus, 60000);
  </script>
</body>
</html>`;

      return new Response(html, {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
