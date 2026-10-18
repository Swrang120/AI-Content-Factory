(function(){
  "use strict";
  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  const API_BASE=(window.ACF_BACKEND_URL||"https://ai-content-factory-zeta-ruby.vercel.app").replace(/\\/+$/,"");
  async function readJson(response){
    const raw=await response.text();
    try{return raw?JSON.parse(raw):{};}catch(_){throw new Error("Backend returned a non-JSON response (HTTP "+response.status+"). Check the Vercel API deployment.");}
  }
  async function loadLiveStatus(){
    const box=document.getElementById("acfLiveStatusBox");
    if(!box)return;
    try{
      const r=await fetch(API_BASE+"/api/live/status",{credentials:"include",cache:"no-store"});
      const s=await readJson(r);
      if(!r.ok||!s.ok)throw new Error(s.error||"Live status unavailable");
      const latest=s.jobs?.[0];
      const state=latest?.status||"no scheduled event";
      const enabled=s.automationEnabled;
      box.innerHTML=
        '<div class="section-head"><div><h3>📡 YouTube Live Control</h3><span class="muted">Daily 2:00 PM–4:00 PM IST · preparation starts 1:55 PM</span></div>'+
        '<span class="badge '+(enabled?"ready":"")+'">'+(enabled?"AUTOMATION ON":"AUTOMATION OFF")+'</span></div>'+
        '<div class="queue-meta">Worker: '+(s.workerConfigured?"configured":"not configured")+' · Latest: <b>'+esc(state)+'</b>'+
        (latest?.scheduledStartTime?" · "+esc(new Date(latest.scheduledStartTime).toLocaleString()):"")+'</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'+
        '<button class="small-btn" type="button" id="acfLiveRefresh">↻ Refresh</button>'+
        '<button class="primary" type="button" id="acfLiveCreate">Create Next Live Event</button></div>'+
        '<div id="acfLiveResult" class="muted" style="margin-top:10px">The event is created by the scheduler when Live Automation is enabled.</div>';
      document.getElementById("acfLiveRefresh")?.addEventListener("click",loadLiveStatus);
      document.getElementById("acfLiveCreate")?.addEventListener("click",async()=>{
        const out=document.getElementById("acfLiveResult");
        out.textContent="Creating scheduled YouTube Live event…";
        try{
          const r=await fetch(API_BASE+"/api/live/create",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({})});
          const x=await readJson(r);
          if(!r.ok||!x.ok)throw new Error(x.error||"Could not create live event");
          out.textContent="✅ Scheduled: "+(x.job?.title||"YouTube Live")+" · "+(x.job?.scheduledStartTime||"");
          loadLiveStatus();
        }catch(e){out.textContent="❌ "+e.message;}
      });
    }catch(e){box.innerHTML='<div class="muted">Live status error: '+esc(e.message)+'</div>';}
  }
  function mount(){
    const title=document.getElementById("page-title");
    const view=document.getElementById("view");
    if(!title||!view)return;
    if(title.textContent.trim()==="Schedule" && !document.getElementById("acfLiveStatusBox")){
      const card=document.createElement("div");
      card.className="table-card";
      card.id="acfLiveStatusBox";
      card.style.marginTop="16px";
      view.appendChild(card);
      loadLiveStatus();
    }
  }
  const observer=new MutationObserver(mount);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  window.addEventListener("load",mount);
  setInterval(()=>{if(document.getElementById("acfLiveStatusBox"))loadLiveStatus();},30000);
})();