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
      st.textContent=".ml-premium{background:linear-gradient(145deg,#07111f,#0b1730 55%,#17102d);border:1px solid rgba(153,120,255,.24);border-radius:24px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.32);overflow:hidden}.ml-hero{padding:8px 4px 20px}.ml-hero h2{margin:6px 0;font-size:28px}.ml-hero p{margin:0;color:#aeb8d3}.ml-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}.ml-stat{padding:16px;border-radius:17px;background:linear-gradient(145deg,rgba(22,35,62,.96),rgba(30,18,56,.9));border:1px solid rgba(157,130,255,.2);min-width:0}.ml-stat-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8997b8}.ml-stat-value{margin-top:7px;font-size:19px;font-weight:800;color:#f5f2ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ml-stat-note{margin-top:4px;font-size:12px;color:#9eabc8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ml-upload{background:linear-gradient(145deg,rgba(22,31,57,.98),rgba(37,19,66,.95));border:1px solid rgba(168,139,255,.34);border-radius:22px;padding:20px;box-shadow:0 14px 42px rgba(65,37,130,.2)}.ml-active{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:linear-gradient(135deg,rgba(118,91,255,.2),rgba(180,72,255,.12));border:1px solid rgba(177,146,255,.28);color:#ded6ff;font-size:11px;font-weight:800;letter-spacing:.05em}.ml-upload h3{margin:14px 0 6px;font-size:21px}.ml-muted{color:#aeb8d3;font-size:13px;line-height:1.5}.ml-field{margin-top:14px}.ml-field label{display:block;color:#c9d1e6;font-size:12px;font-weight:700;margin-bottom:7px}.ml-title{width:100%;padding:13px 14px;border-radius:13px;border:1px solid rgba(150,132,255,.28);background:rgba(3,8,20,.62);color:#fff;box-sizing:border-box;outline:none}.ml-file{width:100%;box-sizing:border-box;padding:13px;border:1px dashed rgba(178,154,255,.55);border-radius:13px;background:rgba(255,255,255,.035);color:#eaf0ff}.ml-btn{width:100%;margin-top:14px;padding:14px 18px;border:0;border-radius:14px;font-weight:850;color:#fff;background:linear-gradient(135deg,#6d5dfc,#a84dff);box-shadow:0 10px 28px rgba(120,76,255,.28)}.ml-status{margin-top:10px;color:#b9c5df;font-size:12px;line-height:1.45}.ml-library{margin-top:14px;padding:18px;border-radius:20px;background:rgba(9,17,31,.72);border:1px solid rgba(145,158,194,.14)}.ml-library-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.ml-library-head h3{margin:0}.ml-search-row{display:flex;gap:8px;width:min(100%,360px)}.ml-search-row input{min-width:0;flex:1}.ml-small-btn{border:1px solid rgba(157,130,255,.25);background:rgba(118,91,255,.1);color:#dcd5ff;border-radius:10px;padding:9px 11px;font-weight:700}.ml-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(145,158,194,.1)}.ml-table{width:100%;border-collapse:collapse;min-width:640px}.ml-table th,.ml-table td{padding:12px;border-bottom:1px solid rgba(145,158,194,.09);text-align:left;font-size:12px}.ml-table th{color:#8491ae;font-size:10px;text-transform:uppercase;letter-spacing:.07em}.ml-table td{color:#dce4f6}.ml-table small{color:#8f9bb5}.ml-manager{margin-top:14px;padding:18px;border-radius:20px;background:linear-gradient(145deg,rgba(18,27,48,.96),rgba(29,18,51,.94));border:1px solid rgba(153,120,255,.2)}.ml-manager h3{margin:0 0 12px}.ml-ai-box{padding:14px;border-radius:14px;background:rgba(3,8,20,.4);border:1px solid rgba(157,130,255,.13);line-height:1.6;color:#cbd4e8}.ml-pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px}.ml-pager-actions{display:flex;gap:7px}@media(max-width:760px){.ml-premium{padding:12px;border-radius:18px}.ml-stat-grid{grid-template-columns:1fr}.ml-hero h2{font-size:24px}.ml-upload,.ml-library,.ml-manager{padding:15px}.ml-library-head{display:block}.ml-search-row{width:100%;margin-top:10px}.ml-table{min-width:590px}}"
      document.head.appendChild(st);
    }
    viewEl.innerHTML=
      '<div class="ml-premium">'+
        '<div class="ml-hero"><p class="eyebrow">ORIGINAL MUSIC • DAILY PROMOTION</p><h2>🎵 Music Library</h2><p>One active song. One simple workflow. Your latest master is promoted every day.</p></div>'+
        '<div class="ml-stat-grid">'+
          '<div class="ml-stat"><div class="ml-stat-label">Library</div><div class="ml-stat-value" id="mlCount">—</div><div class="ml-stat-note">Saved tracks</div></div>'+
          '<div class="ml-stat"><div class="ml-stat-label">Today</div><div class="ml-stat-value" id="mlTodayScore">—</div><div class="ml-stat-note" id="mlTodayName">Loading…</div></div>'+
          '<div class="ml-stat"><div class="ml-stat-label">AI Strategy</div><div class="ml-stat-value">Smart Manager</div><div class="ml-stat-note">Promotion analysis</div></div>'+
        '</div>'+
        '<div class="ml-upload">'+
          '<div class="ml-active">● ACTIVE DAILY PROMOTION</div>'+
          '<h3>Upload New Song</h3>'+
          '<div class="ml-muted">Upload your original master. The newest upload automatically becomes the daily promotion track.</div>'+
          '<div class="ml-field"><label>SONG TITLE <span class="ml-muted">(optional)</span></label><input id="mlTitle" class="ml-title" placeholder="Enter song title"></div>'+
          '<div class="ml-field"><label>ORIGINAL MASTER AUDIO</label><input id="mlAudio" class="ml-file" type="file" accept="audio/*"></div>'+
          '<button class="ml-btn" id="mlAdd">🎵 Set as Daily Promotion</button>'+
          '<div id="mlResult" class="ml-status">Ready for your next release.</div>'+
        '</div>'+
        '<div class="ml-library">'+
          '<div class="ml-library-head"><div><h3>Track Library</h3><span class="ml-muted" id="mlMeta">Loading…</span></div><div class="ml-search-row"><input id="mlSearch" class="ml-title" placeholder="Search title or artist"><button class="ml-small-btn" id="mlSearchBtn">Search</button></div></div>'+
          '<div class="ml-table-wrap"><table class="ml-table"><thead><tr><th>Track</th><th>Status</th><th>Views</th><th>Growth</th><th>Trend</th><th>Promos</th><th>AI</th></tr></thead><tbody id="mlRows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>'+
          '<div class="ml-pager"><span class="ml-muted" id="mlPage">Page 1</span><div class="ml-pager-actions"><button class="ml-small-btn" id="mlPrev">← Previous</button><button class="ml-small-btn" id="mlNext">Next →</button></div></div>'+
        '</div>'+
        '<div class="ml-manager" id="mlManager"><h3>🧠 Music Manager</h3><div class="ml-ai-box">Loading today’s decision…</div></div>'+
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
          '<td>'+mlEscape((t.status||"inactive")==="active"?"● ACTIVE":"INACTIVE")+'</td>'+
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
    var audio=document.getElementById("mlAudio")?.files?.[0]||null;
    var title=(document.getElementById("mlTitle")?.value||"").trim();
    if(!audio){out.textContent="Choose an audio file first.";return;}
    if(!/^audio\\//i.test(audio.type)){out.textContent="Please choose a valid audio file.";return;}
    if(audio.size>100*1024*1024){out.textContent="Audio must be 100 MB or smaller.";return;}
    out.textContent="📤 Uploading original master…";
    try{
      var r=await fetch(mlApi("/api/music/library/upload-master?filename="+encodeURIComponent(audio.name)+"&title="+encodeURIComponent(title)),{
        method:"POST",headers:{"Content-Type":audio.type||"audio/mpeg"},credentials:"include",body:audio
      });
      var b=await r.json().catch(function(){return {};});
      if(!r.ok||!b.ok)throw new Error(b.error||("Upload failed (HTTP "+r.status+")"));
      out.textContent="✓ "+(b.track?.title||"Song")+" is now the active daily promotion track.";
      document.getElementById("mlAudio").value="";
      document.getElementById("mlTitle").value="";
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