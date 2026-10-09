const BUFFER_ENDPOINT = "https://api.buffer.com";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON body.")); }
    });
    req.on("error", reject);
  });
}

async function bufferGraphQL(query, variables = {}) {
  const key = String(process.env.BUFFER_API_KEY || "").trim();
  if (!key) throw new Error("Buffer is not configured. Add BUFFER_API_KEY to Vercel Production Environment Variables.");
  const response = await fetch(BUFFER_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors?.map(x => x.message).filter(Boolean).join("; ");
    throw new Error(detail || "Buffer API request failed with HTTP " + response.status);
  }
  return payload.data || {};
}

async function getChannels() {
  const data = await bufferGraphQL(`query ACFBufferChannels {
    account {
      organizations {
        id
        name
        channels {
          id
          name
          displayName
          descriptor
          service
          type
          externalLink
          isDisconnected
          isLocked
          isQueuePaused
        }
      }
    }
  }`);
  const organizations = data.account?.organizations || [];
  return organizations.flatMap(org => (org.channels || []).map(channel => ({
    ...channel,
    organizationName: org.name,
    organizationId: org.id
  })));
}

function safeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    displayName: channel.displayName || null,
    descriptor: channel.descriptor,
    service: String(channel.service || "").toLowerCase(),
    type: channel.type,
    externalLink: channel.externalLink || null,
    organizationId: channel.organizationId,
    organizationName: channel.organizationName,
    isDisconnected: !!channel.isDisconnected,
    isLocked: !!channel.isLocked,
    isQueuePaused: !!channel.isQueuePaused
  };
}

async function createPost(input) {
  const channelId = String(input.channelId || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  const text = String(input.text || "").trim();
  const title = String(input.title || "").trim().slice(0, 100);
  if (!channelId) throw new Error("channelId is required.");
  if (!mediaUrl) throw new Error("mediaUrl is required.");
  let parsed;
  try { parsed = new URL(mediaUrl); } catch { throw new Error("mediaUrl must be a valid public HTTPS URL."); }
  if (parsed.protocol !== "https:") throw new Error("mediaUrl must use HTTPS.");
  const channel = (await getChannels()).find(x => x.id === channelId);
  if (!channel) throw new Error("The selected channel was not found in your connected Buffer account.");
  if (channel.isDisconnected || channel.isLocked) throw new Error("This Buffer channel is disconnected or locked.");
  if (channel.isQueuePaused) throw new Error("This Buffer channel's queue is paused.");
  const service = String(channel.service || "").toLowerCase();
  if (!["youtube", "instagram", "facebook"].includes(service)) {
    throw new Error("This integration currently supports YouTube, Instagram, and Facebook channels only.");
  }
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now())) {
    throw new Error("dueAt must be a valid future date/time.");
  }
  const mode = dueAt ? "customScheduled" : (input.mode === "shareNow" ? "shareNow" : "addToQueue");
  const metadata = {};
  if (service === "youtube") {
    metadata.youtube = {
      title: title || text.slice(0, 100) || "AI Content Factory",
      category: String(input.youtubeCategory || "Entertainment"),
      privacy: String(input.privacyStatus || "public")
    };
  }
  if (service === "instagram") {
    metadata.instagram = { postType: "reel" };
  }
  if (service === "facebook") {
    metadata.facebook = { postType: "reel" };
  }
  const variables = {
    input: {
      channelId,
      text,
      assets: [{ url: mediaUrl, type: "video" }],
      schedulingType: "automatic",
      mode,
      ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {}),
      aiAssisted: true,
      saveToDraft: false
    }
  };
  const data = await bufferGraphQL(`mutation ACFBufferCreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post { id status dueAt text channelId }
      }
      ... on MutationError { message }
    }
  }`, variables);
  const result = data.createPost;
  if (result?.message) throw new Error(result.message);
  if (!result?.post?.id) throw new Error("Buffer did not confirm that the post was created.");
  return result.post;
}

module.exports.handler = async (req, res) => {
  const url = new URL(req.url || "/", "https://acf.local");
  const route = url.pathname.replace(/^\/api\/buffer\/?/, "").replace(/\/$/, "");
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && route === "status") {
    if (!process.env.BUFFER_API_KEY) return send(res, 200, { ok: true, configured: false, connected: false, message: "Add BUFFER_API_KEY in Vercel Production settings." });
    try {
      const channels = await getChannels();
      return send(res, 200, {
        ok: true, configured: true, connected: true,
        channels: channels.map(safeChannel),
        supportedChannels: channels.filter(x => ["youtube", "instagram", "facebook"].includes(String(x.service).toLowerCase())).map(safeChannel)
      });
    } catch (error) {
      return send(res, 502, { ok: false, configured: true, connected: false, error: String(error.message || error).slice(0, 500) });
    }
  }
  if (req.method === "GET" && route === "channels") {
    try {
      const channels = await getChannels();
      return send(res, 200, { ok: true, channels: channels.map(safeChannel) });
    } catch (error) {
      return send(res, 502, { ok: false, error: String(error.message || error).slice(0, 500) });
    }
  }
  if (req.method === "POST" && route === "publish") {
    try {
      if (process.env.APP_API_KEY && req.headers["x-api-key"] !== process.env.APP_API_KEY) {
        return send(res, 401, { ok: false, error: "Unauthorized" });
      }
      const body = await readBody(req);
      const channelIds = Array.isArray(body.channelIds) ? [...new Set(body.channelIds.map(x => String(x).trim()).filter(Boolean))] : [String(body.channelId || "").trim()].filter(Boolean);
      if (!channelIds.length) return send(res, 400, { ok: false, error: "Select at least one Buffer channel." });
      if (channelIds.length > 10) return send(res, 400, { ok: false, error: "Publish to a maximum of 10 channels per request." });
      const results = await Promise.all(channelIds.map(async channelId => {
        try {
          const post = await createPost({ ...body, channelId });
          return { channelId, ok: true, post };
        } catch (error) {
          return { channelId, ok: false, error: String(error.message || error).slice(0, 500) };
        }
      }));
      const ok = results.some(x => x.ok);
      return send(res, ok ? 200 : 400, { ok, results });
    } catch (error) {
      return send(res, 400, { ok: false, error: String(error.message || error).slice(0, 500) });
    }
  }
  return send(res, 404, { ok: false, error: "Unknown Buffer endpoint." });
};
