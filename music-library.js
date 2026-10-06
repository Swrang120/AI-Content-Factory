(function(){
  "use strict";

  var musicLibraryPage = 0;

  function mlEscape(value){
    return String(value == null ? "" : value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function mlApi(path){
    if(typeof window.apiUrl === "function") return window.apiUrl(path);
    var base=window.ACF_BACKEND_URL || localStorage.getItem("acf_backend_url") || "https://ai-content-factory-zeta-ruby.vercel.app";
    return base.replace(/\/+$/,"")+path;
  }

  function renderMusicLibrary(){
    var titleEl=document.getElementById("page-title");
    var viewEl=document.getElementById("view");
    if(titleEl) titleEl.textContent="Music Library";
    if(!viewEl) return;

    var styleId="music-library-premium-style";
    if(!document.getElementById(styleId)){
      var st=document.createElement("style");
      st.id=styleId;
      st.textContent=".ml-premium{background:linear-gradient(135deg,#07111f 0%,#0b1730 55%,#17102d 100%);border:1px solid rgba(124,92,255,.25);border-radius:22px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.28)}.ml-upload{background:linear-gradient(135deg,rgba(18,31,58,.96),rgba(31,18,61,.96));border:1px solid rgba(153,120,255,.38);border-radius:20px;padding:20px;box-shadow:0 12px 35px rgba(77,45,160,.18)}.ml-upload h3{margin:0 0 6px}.ml-upload .muted{color:#aeb8d3}.ml-file{width:100%;padding:14px;border:1px dashed rgba(178,154,255,.65);border-radius:14px;background:rgba(255,255,255,.035);color:#eaf0ff}.ml-title{width:100%;padding:13px 14px;border-radius:12px;border:1px solid rgba(150,132,255,.28);background:rgba(3,8,20,.5);color:#fff;box-sizing:border-box}.ml-btn{width:100%;margin-top:14px;padding:14px 18px;border:0;border-radius:13px;font-weight:800;color:#fff;background:linear-gradient(135deg,#6d5dfc,#a84dff);box-shadow:0 8px 25px rgba(120,76,255,.3)}.ml-status{margin-top:10px;color:#b9c5df;font-size:13px}.ml-active{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:rgba(107,91,255,.12);border:1px solid rgba(157,130,255,.25);color:#d8d0ff;font-size:12px;font-weight:700}";
      document.head.appendChild(st);
    }
    viewEl.innerHTML=
      '<div class="ml-premium">'+
        '<div class="hero" style="background:transparent;padding:4px 4px 18px"><p class="eyebrow">ORIGINAL MUSIC PROMOTION</p><h2>🎵 Music Library</h2><p>Upload one master audio. That is the track the system promotes every day.</p></div>'+
        '<div class="cards">'+
          '<div class="card"><div class="metric-label">Library</div><div class="metric" id="mlCount">—</div><div class="metric-note">Saved tracks</div></div>'+
          '<div class="card"><div class="metric-label">Today’s Track</div><div class="metric" id="mlTodayScore">—</div><div class="metric-note" id="mlTodayName">Loading…</div></div>'+
          '<div class="card"><div class="metric-label">AI Manager</div><div class="metric">ChatGPT + Gemini</div><div class="metric-note">Promotion strategy</div></div>'+
        '</div>'+
        '<div class="ml-upload">'+
          '<div class="ml-active">● ACTIVE DAILY PROMOTION</div>'+
          '<h3 style="margin-top:12px">Upload New Song</h3>'+
          '<div class="muted">The newest uploaded audio automatically replaces the previous daily promotion track. Old tracks remain saved.</div>'+
          '<div style="margin-top:15px"><input id="mlTitle" class="ml-title" placeholder="Song title (optional)"></div>'+
          '<div style="margin-top:10px"><input id="mlAudio" class="ml-file" type="file" accept="audio/*"></div>'+
          '<button class="ml-btn" id="mlAdd">🎵 Set as Daily Promotion</button>'+
          '<div id="mlResult" class="ml-status">Ready.</div>'+
        '</div>'+
        '<div class="table-card" style="margin-top:16px">'+
          '<div class="section-head"><div><h3>Track Library</h3><span class="muted" id="mlMeta">Loading…</span></div>'+
            '<div><input id="mlSearch" placeholder="Search title / artist"><button class="small-btn" id="mlSearchBtn">Search</button></div>'+
          '</div>'+
          '<div class="table-wrap"><table class="table"><thead><tr><th>Track</th><th>Status</th><th>Views</th><th>Growth</th><th>Trend</th><th>Promos</th><th>AI</th></tr></thead>'+
          '<tbody id="mlRows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>'+
          '<div class="section-head" style="margin-top:14px"><span class="muted" id="mlPage">Page 1</span><div><button class="small-btn" id="mlPrev">← Previous</button><button class="small-btn" id="mlNext">Next →</button></div></div>'+
        '</div>'+
        '<div class="table-card" id="mlManager"><h3>🧠 Music Manager</h3><div class="ai-result">Loading today’s decision…</div></div>'+
      '</div>';

    document.getElementById("mlAdd").onclick=musicLibraryAdd;
    document.getElementById("mlSearchBtn").onclick=function(){musicLibraryPage=0;loadMusicLibrary();};
    document.getElementById("mlSearch").addEventListener("keydown",function(e){
      if(e.key==="Enter"){musicLibraryPage=0;loadMusicLibrary();}
    });
    document.getElementById("mlPrev").onclick=function(){
      if(musicLibraryPage>0){musicLibraryPage--;loadMusicLibrary();}
    };
    document.getElementById("mlNext").onclick=function(){musicLibraryPage++;loadMusicLibrary();};

    loadMusicLibrary();
    musicManagerToday();
  }

  async function loadMusicLibrary(){
    var rows=document.getElementById("mlRows");
    var meta=document.getElementById("mlMeta");
    if(!rows) return;
    try{
      var q=(document.getElementById("mlSearch")?.value||"").trim();
      var r=await fetch(mlApi("/api/music/library?page="+musicLibraryPage+"&limit=25&sort=trend&q="+encodeURIComponent(q)),{
        credentials:"include",cache:"no-store"
      });
      var b=await r.json().catch(function(){return {};});
      if(!r.ok || !b.ok) throw new Error(b.error||("Music Library unavailable (HTTP "+r.status+")"));

      var count=Number(b.count||b.total||0);
      var tracks=Array.isArray(b.tracks)?b.tracks:[];
      var pageCount=Math.max(1,Math.ceil(count/25));

      var countEl=document.getElementById("mlCount");
      if(countEl) countEl.textContent=count.toLocaleString();
      if(meta) meta.textContent=count.toLocaleString()+" tracks";
      var pageEl=document.getElementById("mlPage");
      if(pageEl) pageEl.textContent="Page "+(musicLibraryPage+1)+" of "+pageCount;

      rows.innerHTML=tracks.length?tracks.map(function(t){
        return '<tr>'+
          '<td><strong>'+mlEscape(t.title||"Untitled")+'</strong><br><small>'+mlEscape(t.artist||"")+'</small></td>'+
          '<td>'+mlEscape(t.rightsStatus||t.rights_status||"")+'</td>'+
          '<td>'+Number(t.views||0).toLocaleString()+'</td>'+
          '<td>'+Number(t.viewVelocity||t.view_velocity||0).toFixed(0)+'/day</td>'+
          '<td><strong>'+Number(t.trendScore||t.trend_score||0).toFixed(1)+'</strong></td>'+
          '<td>'+Number(t.promotionCount||t.promotion_count||0)+'</td>'+
          '<td><button class="small-btn" data-ml-ai="'+mlEscape(t.id)+'">🧠 AI</button></td>'+
        '</tr>';
      }).join(""):'<tr><td colspan="7">No tracks on this page.</td></tr>';

      rows.querySelectorAll("[data-ml-ai]").forEach(function(btn){
        btn.onclick=function(){musicAnalyze(btn.getAttribute("data-ml-ai"));};
      });

      var prev=document.getElementById("mlPrev"),next=document.getElementById("mlNext");
      if(prev) prev.disabled=musicLibraryPage<=0;
      if(next) next.disabled=(musicLibraryPage+1)>=pageCount || tracks.length===0;
    }catch(e){
      rows.innerHTML='<tr><td colspan="7">Music Library error: '+mlEscape(e.message)+'</td></tr>';
      if(meta) meta.textContent="Unable to load";
    }
  }

  async function musicLibraryChannelSyncAll(){
    var out=document.getElementById("mlChannelResult");
    var button=document.getElementById("mlChannelSyncAll");
    if(button)button.disabled=true;
    if(out)out.textContent="🔄 Syncing both configured YouTube music channels…";
    try{
      var r=await fetch(mlApi("/api/music/library/sync-sources"),{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"include"
      });
      var b=await r.json().catch(function(){return {};});
      if(!r.ok||!b.ok)throw new Error(b.error||("Source sync failed (HTTP "+r.status+")"));
      var lines=(b.channels||[]).map(function(x){
        return (x.channel?.title||x.channelId)+": "+Number(x.imported||0)+" imported"+(x.error?" · "+x.error:"");
      });
      if(out)out.textContent="✓ Synced both sources · "+Number(b.imported||0)+" imported · "+Number(b.skipped||0)+" skipped"+(lines.length?" · "+lines.join(" | "):"");
      await loadMusicLibrary();
      await musicManagerToday();
    }catch(e){
      if(out)out.textContent="YouTube source sync error: "+e.message;
    }finally{
      if(button)button.disabled=false;
    }
  }


  async function musicLibraryAdd(){
    var out=document.getElementById("mlResult");
    var link=(document.getElementById("mlLink")?.value||"").trim();
    var rights=document.getElementById("mlRights")?.value||"owned";
    var audio=document.getElementById("mlAudio")?.files?.[0]||null;
    var tags=(document.getElementById("mlTags")?.value||"").split(",").map(function(x){return x.trim();}).filter(Boolean);

    if(!link){out.textContent="Add a Spotify or YouTube link first.";return;}
    var isSpotify=/spotify\.com\/track\//i.test(link);
    var isYouTube=/(youtube\.com|youtu\.be)/i.test(link);
    if(!isSpotify && !isYouTube){out.textContent="Use a valid Spotify track or YouTube video link.";return;}
    if(rights==="metadata_only" && audio){out.textContent="Metadata-only tracks cannot attach master audio.";return;}

    out.textContent="🎵 Saving track…";
    try{
      var payload=isSpotify?{spotifyUrl:link,rightsStatus:rights,tags:tags}:{youtubeUrl:link,rightsStatus:rights,tags:tags};
      var r=await fetch(mlApi("/api/music/library/import"),{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(payload)
      });
      var b=await r.json().catch(function(){return {};});
      if(!r.ok || !b.ok) throw new Error(b.error||("Could not add track (HTTP "+r.status+")"));

      var track=Array.isArray(b.tracks)?b.tracks[0]:b.track;
      if(audio && track?.id){
        out.textContent="📤 Uploading original master…";
        var ar=await fetch(mlApi("/api/music/library/audio?id="+encodeURIComponent(track.id)+"&filename="+encodeURIComponent(audio.name)),{
          method:"POST",headers:{"Content-Type":audio.type||"audio/mpeg"},credentials:"include",body:audio
        });
        var ab=await ar.json().catch(function(){return {};});
        if(!ar.ok || !ab.ok) throw new Error(ab.error||("Audio upload failed (HTTP "+ar.status+")"));
        track=ab.track||track;
      }

      out.textContent="✓ Added "+(track?.title||"track")+(track?.audioUrl||track?.audio_url?" · master attached":" · add your original master before automatic promotion");
      document.getElementById("mlLink").value="";
      document.getElementById("mlAudio").value="";
      document.getElementById("mlTags").value="";
      await loadMusicLibrary();
      await musicManagerToday();
    }catch(e){
      out.textContent="Music Library error: "+e.message;
    }
  }

  async function musicAnalyze(id){
    var out=document.getElementById("mlManager");
    if(!out) return;
    out.scrollIntoView({behavior:"smooth",block:"center"});
    try{
      var r=await fetch(mlApi("/api/music/library/"+encodeURIComponent(id)+"/analyze"),{method:"POST",credentials:"include"});
      var b=await r.json().catch(function(){return {};});
      if(!r.ok || !b.ok) throw new Error(b.error||("AI analysis failed (HTTP "+r.status+")"));
      out.innerHTML="<h3>🧠 Music Manager Analysis</h3><pre class='ai-result'>"+mlEscape(JSON.stringify(b.analysis||b,null,2))+"</pre>";
    }catch(e){
      out.innerHTML="<h3>🧠 Music Manager</h3><div class='ai-result'>"+mlEscape(e.message)+"</div>";
    }
  }

  async function musicManagerToday(){
    var score=document.getElementById("mlTodayScore");
    var name=document.getElementById("mlTodayName");
    var out=document.getElementById("mlManager");
    if(!score || !out) return;
    try{
      var r=await fetch(mlApi("/api/music/manager/today"),{credentials:"include",cache:"no-store"});
      var b=await r.json().catch(function(){return {};});
      if(!r.ok || !b.ok) throw new Error(b.error||("No eligible track yet (HTTP "+r.status+")"));
      var track=b.track||{};
      score.textContent=Number(track.trendScore||track.trend_score||0).toFixed(1);
      name.textContent=(track.title||"Track")+" · "+(track.artist||"");
      var manager=b.manager||{};
      out.innerHTML="<h3>🧠 Today's Music Manager Decision</h3><div class='ai-result'><b>ChatGPT</b><br>"+mlEscape(manager.chatgpt||"Unavailable")+"<br><br><b>Gemini</b><br>"+mlEscape(manager.gemini||"Unavailable")+"</div>";
    }catch(e){
      score.textContent="—";
      name.textContent="No eligible track yet";
      out.innerHTML="<h3>🧠 Music Manager</h3><div class='ai-result'>"+mlEscape(e.message)+"</div>";
    }
  }

  window.renderMusicLibrary=renderMusicLibrary;

  var originalSetView=window.setView;
  window.setView=function(v){
    if(v==="music-library"){
      document.querySelectorAll(".nav-item").forEach(function(btn){btn.classList.toggle("active",btn.dataset.view===v);});
      renderMusicLibrary();
      return;
    }
    if(typeof originalSetView==="function") return originalSetView(v);
  };

  document.querySelectorAll('.nav-item[data-view="music-library"]').forEach(function(btn){
    btn.addEventListener("click",function(){window.setView("music-library");});
  });
})();