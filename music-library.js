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

    viewEl.innerHTML =
      '<div class="hero"><p class="eyebrow">ORIGINAL MUSIC INTELLIGENCE</p><h2>🎵 Music Library</h2><p>Connect your own YouTube channel, import releases automatically, and let AI rank promotion opportunities.</p></div>'+
      '<div class="cards">'+
        '<div class="card"><div class="metric-label">Library</div><div class="metric" id="mlCount">—</div><div class="metric-note">Total saved tracks</div></div>'+
        '<div class="card"><div class="metric-label">Today’s AI Pick</div><div class="metric" id="mlTodayScore">—</div><div class="metric-note" id="mlTodayName">Loading…</div></div>'+
        '<div class="card"><div class="metric-label">AI Manager</div><div class="metric">ChatGPT + Gemini</div><div class="metric-note">Trend + promotion strategy</div></div>'+
      '</div>'+
      '<div class="table-card">'+
        '<div class="section-head"><div><h3>📺 My Music Source Channels</h3><span class="muted">Two configured YouTube source channels are synced automatically. The library keeps source links and performance data; it does not download YouTube audio.</span></div></div>'+
        '<div class="ai-result" style="margin-bottom:12px">'+
          '<div>🎵 <b>Swrang Swargiary</b> source</div><div>🎼 <b>Santiram Swargiary</b> source</div>'+
          '<div class="muted" style="margin-top:6px">Daily target: 1 music promotion · source rotation across both channels.</div>'+
        '</div>'+
        '<div class="form-grid">'+
          '<label>Channel 1<input id="mlChannel1" value="https://www.youtube.com/channel/UC_7oWDyqUuF8FtCm3XWkMvQ" readonly></label>'+
          '<label>Channel 2<input id="mlChannel2" value="https://www.youtube.com/channel/UC45qxqZuEpQvYs14c1pLf7Q" readonly></label>'+
        '</div>'+
        '<button class="primary" id="mlChannelSyncAll">📺 Sync Both Music Channels</button>'+
        '<div id="mlChannelResult" class="muted" style="margin-top:10px">Ready. The scheduler also syncs these sources before the daily Music Promotion slot.</div>'+
      '</div>'+
      '<div class="table-card">'+
        '<div class="section-head"><div><h3>＋ Add Music</h3><span class="muted">Add a Spotify/YouTube release link. Upload only your own or authorized master audio.</span></div></div>'+
        '<div class="form-grid">'+
          '<label>Spotify or YouTube Link<input id="mlLink" placeholder="Spotify track or YouTube video URL"></label>'+
          '<label>Rights<select id="mlRights"><option value="owned">OWNED — my original song</option><option value="authorized">AUTHORIZED</option><option value="metadata_only">METADATA ONLY</option></select></label>'+
        '</div>'+
        '<div class="form-grid">'+
          '<label>Original Master Audio<input id="mlAudio" type="file" accept="audio/*"></label>'+
          '<label>Tags<input id="mlTags" placeholder="romantic, Bodo, sad"></label>'+
        '</div>'+
        '<button class="primary" id="mlAdd">🎵 Add to Music Library</button>'+
        '<div id="mlResult" class="muted" style="margin-top:10px">Ready.</div>'+
      '</div>'+
      '<div class="table-card">'+
        '<div class="section-head"><div><h3>Track Intelligence</h3><span class="muted" id="mlMeta">Loading…</span></div>'+
          '<div><input id="mlSearch" placeholder="Search title / artist"><button class="small-btn" id="mlSearchBtn">Search</button></div>'+
        '</div>'+
        '<div class="table-wrap"><table class="table"><thead><tr><th>Track</th><th>Rights</th><th>Views</th><th>Growth</th><th>Trend</th><th>Promos</th><th>AI</th></tr></thead>'+
        '<tbody id="mlRows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>'+
        '<div class="section-head" style="margin-top:14px"><span class="muted" id="mlPage">Page 1</span><div><button class="small-btn" id="mlPrev">← Previous</button><button class="small-btn" id="mlNext">Next →</button></div></div>'+
      '</div>'+
      '<div class="table-card" id="mlManager"><h3>🧠 Music Manager</h3><div class="ai-result">Loading today’s decision…</div></div>';

    document.getElementById("mlAdd").onclick=musicLibraryAdd;
    document.getElementById("mlChannelSyncAll").onclick=musicLibraryChannelSyncAll;
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