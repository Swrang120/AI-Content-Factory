(() => {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api = (p) => typeof window.apiUrl === "function" ? window.apiUrl(p) : ((window.ACF_BACKEND_URL || localStorage.getItem("acf_backend_url") || "https://ai-content-factory-gussvkdme-swrang120.vercel.app").replace(/\/+$/,"") + p);
  let lastSignature = "", busy = false;
  function ensureUI() {
    if (document.getElementById("acfNoticeButton")) return;
    const actions = document.querySelector(".top-actions");
    if (!actions) return;
    const btn = document.createElement("button");
    btn.id = "acfNoticeButton"; btn.className = "icon-btn"; btn.type = "button";
    btn.title = "Notifications & system errors"; btn.setAttribute("aria-label","Notifications & system errors");
    btn.style.cssText = "position:relative;min-width:44px;font-size:19px";
    btn.innerHTML = "🔔<span id=\"acfNoticeCount\" style=\"position:absolute;right:-4px;top:-5px;min-width:17px;height:17px;padding:0 3px;border-radius:10px;background:#ef4444;color:white;font-size:10px;line-height:17px;display:none\">0</span>";
    actions.prepend(btn);
    const panel = document.createElement("section");
    panel.id = "acfNoticePanel";
    panel.style.cssText = "display:none;position:fixed;z-index:99999;right:16px;top:76px;width:min(560px,calc(100vw - 32px));max-height:78vh;overflow:auto;background:#0b1425;color:#edf2ff;border:1px solid #34415e;border-radius:16px;box-shadow:0 20px 70px #0009;padding:16px";
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b style="font-size:17px">🔔 Factory Notifications</b><div id="acfNoticeUpdated" style="font-size:11px;color:#9ba8c2;margin-top:4px">Waiting for health check…</div></div><div style="display:flex;gap:6px"><button id="acfNoticeScan" class="small-btn" type="button">↻ Scan</button><button id="acfNoticeClose" class="icon-btn" type="button" aria-label="Close notifications">×</button></div></div><div id="acfNoticeSummary" style="margin:14px 0;padding:10px;border-radius:10px;background:#111f35">Checking services…</div><div id="acfNoticeServices"></div><h3 style="margin:18px 0 8px">Recent errors / incidents</h3><div id="acfNoticeIncidents" style="font-size:12px;color:#c9d3e8">No incidents loaded yet.</div><p style="font-size:11px;color:#8997b3;margin-top:14px">Status comes from the backend health checks. A configured key alone does not prove a service is working.</p>';
    document.body.appendChild(panel);
    btn.addEventListener("click", () => { panel.style.display = panel.style.display === "block" ? "none" : "block"; refresh(true); });
    panel.querySelector("#acfNoticeClose").addEventListener("click", () => panel.style.display = "none");
    panel.querySelector("#acfNoticeScan").addEventListener("click", () => refresh(true));
  }
  function paint(data) {
    const health = Array.isArray(data.health) ? data.health : [];
    const incidents = Array.isArray(data.recentIncidents) ? data.recentIncidents : [];
    const failed = health.filter(x => !x.ok);
    const count = failed.length + incidents.filter(x => !x.healed).length;
    const bubble = document.getElementById("acfNoticeCount");
    if (bubble) { bubble.textContent = count > 99 ? "99+" : String(count); bubble.style.display = count ? "block" : "none"; }
    const summary = document.getElementById("acfNoticeSummary");
    if (summary) {
      summary.style.border = "1px solid " + (failed.length ? "#ef4444" : "#22c55e");
      summary.innerHTML = (failed.length ? "⚠️ <b>" + failed.length + " service check(s) failed</b>" : "✅ <b>Health checks passed</b>") + '<div style="font-size:11px;color:#aab6cf;margin-top:4px">' + health.length + " checks returned · " + incidents.length + " recent incident(s)</div>";
    }
    const services = document.getElementById("acfNoticeServices");
    if (services) services.innerHTML = health.length ? health.map(x => '<div style="padding:9px 0;border-bottom:1px solid #26344b;display:flex;gap:10px;align-items:flex-start"><span>'+(x.ok?"🟢":"🔴")+'</span><div style="min-width:0;flex:1"><b>'+esc(x.name||"Service")+'</b><div style="color:'+(x.ok?"#9ba8c2":"#ffb4b4")+';font-size:12px;margin-top:3px;overflow-wrap:anywhere">'+esc(x.detail|| (x.ok?"OK":"Check failed"))+'</div></div><span style="font-size:10px">'+(x.ok?"OK":"ERROR")+'</span></div>').join("") : '<div style="color:#fbbf24;font-size:12px">Backend returned no service checks.</div>';
    const inc = document.getElementById("acfNoticeIncidents");
    if (inc) inc.innerHTML = incidents.length ? incidents.map(x => '<div style="padding:10px;margin:7px 0;background:#111f35;border-radius:10px;border-left:3px solid '+(x.healed?"#22c55e":"#ef4444")+'"><b>'+esc(x.operation||"Runtime error")+'</b> <span style="color:#91a0bb">· '+esc(x.at||"time unknown")+'</span><div style="margin-top:4px;overflow-wrap:anywhere">'+esc(x.message||"No error message")+'</div>'+(x.diagnosis?'<div style="margin-top:5px;color:#a8b5d0">Diagnosis: '+esc(x.diagnosis)+'</div>':"")+'<div style="font-size:10px;margin-top:4px;color:'+(x.healed?"#86efac":"#fca5a5")+'">'+(x.healed?"Marked healed":"Needs attention")+'</div></div>').join("") : '<div style="padding:10px;background:#111f35;border-radius:10px">No recent incidents reported by backend.</div>';
    const updated = document.getElementById("acfNoticeUpdated");
    if (updated) updated.textContent = "Last checked: " + new Date().toLocaleString();
    const sig = JSON.stringify({failed:failed.map(x=>x.name+":"+x.detail), incidents:incidents.map(x=>x.id+":"+x.message)});
    if (lastSignature && sig !== lastSignature && (failed.length || incidents.length)) {
      const newFail = failed.length > 0;
      if ("Notification" in window && Notification.permission === "granted") new Notification(newFail ? "AI Content Factory: issue detected" : "AI Content Factory update", {body:newFail ? failed.map(x=>x.name+": "+x.detail).join("\n").slice(0,180) : "New incident information available in Factory Notifications."});
    }
    lastSignature = sig;
  }
  async function refresh(scan) {
    if (busy) return; busy = true;
    const summary = document.getElementById("acfNoticeSummary");
    if (summary && scan) summary.textContent = "🔎 Checking backend health and recent incidents…";
    try {
      let response;
      if (scan) {
        response = await fetch(api("/api/self-heal/scan"), {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:"{}"});
      } else {
        response = await fetch(api("/api/self-heal/status"), {credentials:"include", cache:"no-store"});
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || ("Health endpoint returned HTTP " + response.status));
      paint(data);
    } catch (e) {
      const bubble = document.getElementById("acfNoticeCount"); if (bubble) { bubble.textContent = "!"; bubble.style.display = "block"; }
      if (summary) { summary.style.border = "1px solid #ef4444"; summary.innerHTML = '🔴 <b>Monitoring could not reach the backend</b><div style="font-size:12px;margin-top:6px;overflow-wrap:anywhere">'+esc(e.message)+'<br>Check deployment URL, backend availability, and access/session configuration.</div>'; }
      const services = document.getElementById("acfNoticeServices"); if (services) services.innerHTML = "";
      const inc = document.getElementById("acfNoticeIncidents"); if (inc) inc.textContent = "Incident history is unavailable because the health endpoint failed.";
      const updated = document.getElementById("acfNoticeUpdated"); if (updated) updated.textContent = "Health check failed at " + new Date().toLocaleString();
    } finally { busy = false; }
  }
  function init() {
    ensureUI();
    if (!document.getElementById("acfNoticeButton")) return;
    refresh(false);
    window.setInterval(() => refresh(false), 60000);
    if ("Notification" in window && Notification.permission === "default") {
      // Ask only after an explicit click, never automatically on page load.
      document.getElementById("acfNoticeButton").addEventListener("contextmenu", e => { e.preventDefault(); Notification.requestPermission(); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();