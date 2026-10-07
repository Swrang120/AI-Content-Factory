(function(){
  "use strict";

  var page=0;

  function esc(v){
    return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function api(path){
    var base=(window.ACF_BACKEND_URL||localStorage.getItem("acf_backend_url")||"https://factory-zeta-ruby.vercel.app");
    if(typeof window.apiUrl==="function") return window.apiUrl(path);
    return base.replace(/\/+$/,"")+path;
  }

  function renderMusicLibrary(){
    var view=document.getElementById("view");
    var title=document.getElementById("page-title");
    if(!view) return;
    if(title) title.textContent="Music Library";

    view.innerHTML=
      '<style id="ml-safe-style">'+
      '.ml-safe{padding:18px}.ml-safe h2{margin:0 0 8px}.ml-safe p{color:#aeb8d3}.ml-upload,.ml-list{margin-top:16px;padding:16px;border:1px solid rgba(160,140,255,.22);border-radius:16px;background:rgba(10,20,38,.75)}'+
      '.ml-upload input{width:100%;box-sizing:border-box;margin:7px 0;padding:11px;border-radius:10px;background:#07111f;color:#fff;border:1px solid #34415e}.ml-btn{width:100%;padding:13px;border:0;border-radius:11px;background:#e8b83f;color:#111;font-weight:800}.ml-table{width:100%;border-collapse:collapse}.ml-table th,.ml-table td{padding:11px 7px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-size:12px}.ml-table th{color:#8e9ab4}.ml-audio{width:180px;max-width:100%;height:34px}.ml-active{color:#8ff0a8;font-weight:800}.ml-delete{padding:7px 10px;border-radius:8px;border:1px solid rgba(255,90,90,.4);background:rgba(255,60,60,.1);color:#ffb0b0}.ml-scroll{overflow:auto}.ml-msg{margin-top:10px;font-size:12px}.ml-empty{text-align:center;padding:24px;color:#9ba8c2}'+
      '</style>'+
      '<div class="ml-safe">'+
        '<p class="eyebrow">ORIGINAL MUSIC • DAILY PROMOTION</p>'+
        '<h2>🎵 Music Library</h2>'+
        '<p>All uploaded original masters are listed here. The active track is promoted automatically.</p>'+
        '<div class="ml-upload">'+
          '<b>Upload New Song</b>'+
          '<input id="mlSafeTitle" type="text" placeholder="Song title">'+
          '<input id="mlSafeFile" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac">'+
          '<button id="mlSafeUpload" class="ml-btn" type="button">🎵 Upload & Set as Daily Promotion</button>'+
          '<div id="mlSafeMsg" class="ml-msg">Ready.</div>'+
        '</div>'+
        '<div class="ml-list">'+
          '<h3>Track Library</h3>'+
          '<div class="ml-scroll"><table class="ml-table"><thead><tr><th>Track</th><th>Listen</th><th>Status</th><th>Promos</th><th>Action</th></tr></thead><tbody id="mlSafeRows"><tr><td colspan="5" class="ml-empty">Loading…</td></tr></tbody></table></div>'+
        '</div>'+
      '</div>';

    document.getElementById("mlSafeUpload").onclick=upload;
    load();
  }

  async function load(){
    var rows=document.getElementById("mlSafeRows");
    if(!rows) return;
    try{
      var sync=await fetch(api("/api/music/library/sync-storage"),{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"
      });
      await sync.json().catch(function(){});
      var r=await fetch(api("/api/music/library?page="+page+"&limit=50&sort=recent"),{credentials:"include",cache:"no-store"});
      var b=await r.json();
      if(!r.ok||!b.ok) throw new Error(b.error||("Music Library unavailable: HTTP "+r.status));
      var tracks=Array.isArray(b.tracks)?b.tracks:[];
      if(!tracks.length){
        rows.innerHTML='<tr><td colspan="5" class="ml-empty">No uploaded music found in the Music Library.</td></tr>';
        return;
      }
      rows.innerHTML=tracks.map(function(t){
        var audio=String(t.audioUrl||t.audio_url||"");
        var player=audio?'<audio class="ml-audio" controls preload="none" src="'+esc(audio)+'"></audio>':'<span>No audio</span>';
        var active=String(t.status||"")=="active";
        return '<tr>'+
          '<td><b>'+esc(t.title||"Untitled")+'</b><br><small>'+esc(t.artist||"")+'</small></td>'+
          '<td>'+player+'</td>'+
          '<td class="'+(active?"ml-active":"")+'">'+(active?"● ACTIVE":"PAUSED")+'</td>'+
          '<td>'+Number(t.promotionCount||t.promotion_count||0).toLocaleString()+'</td>'+
          '<td><button type="button" class="ml-delete" data-delete-id="'+esc(t.id)+'">🗑️ Delete</button></td>'+
        '</tr>';
      }).join("");
      var buttons=rows.querySelectorAll("[data-delete-id]");
      for(var i=0;i<buttons.length;i++){
        buttons[i].onclick=function(){removeTrack(this.getAttribute("data-delete-id"));};
      }
    }catch(e){
      rows.innerHTML='<tr><td colspan="5" class="ml-empty">❌ '+esc(e.message||e)+'</td></tr>';
    }
  }

  async function upload(){
    var msg=document.getElementById("mlSafeMsg");
    var btn=document.getElementById("mlSafeUpload");
    var fileEl=document.getElementById("mlSafeFile");
    var titleEl=document.getElementById("mlSafeTitle");
    var file=fileEl&&fileEl.files?fileEl.files[0]:null;
    var songTitle=titleEl?titleEl.value.trim():"";
    if(!file){msg.textContent="⚠️ Choose an audio file first.";return;}
    if(file.size>500*1024*1024){msg.textContent="⚠️ Maximum audio size is 500 MB.";return;}
    btn.disabled=true;
    try{
      msg.textContent="🔐 Preparing Supabase Storage upload…";
      var p=await fetch(api("/api/music/library/upload-token"),{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({filename:file.name,title:songTitle})
      });
      var pb=await p.json();
      if(!p.ok||!pb.ok) throw new Error(pb.error||("Upload preparation failed: HTTP "+p.status));

      msg.textContent="📤 Uploading to Supabase Storage…";
      var mime=file.type||({mp3:"audio/mpeg",wav:"audio/wav",m4a:"audio/mp4",aac:"audio/aac",ogg:"audio/ogg",flac:"audio/flac"}[(file.name.split(".").pop()||"").toLowerCase()]||"audio/mpeg");
      var put=await fetch(pb.signedUrl,{method:"PUT",headers:{"Content-Type":mime,"Cache-Control":"max-age=3600","x-upsert":"false"},body:file});
      if(!put.ok){var uploadDetail=await put.text().catch(function(){return "";});throw new Error("Supabase Storage upload failed: HTTP "+put.status+(uploadDetail?" — "+uploadDetail.slice(0,300):""));}

      msg.textContent="☁️ Saving track to Music Library…";
      var a=await fetch(api("/api/music/library/activate-upload"),{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:pb.id,pathname:pb.pathname,title:pb.title||songTitle||file.name})
      });
      var ab=await a.json();
      if(!a.ok||!ab.ok) throw new Error(ab.error||("Music Library save failed: HTTP "+a.status));

      msg.textContent="✅ "+(ab.track&&ab.track.title?ab.track.title:pb.title)+" is now ACTIVE.";
      fileEl.value="";
      titleEl.value="";
      await load();
    }catch(e){
      msg.textContent="❌ Upload failed: "+(e.message||e);
    }finally{
      btn.disabled=false;
    }
  }

  async function removeTrack(id){
    if(!id) return;
    if(!window.confirm("Delete this track from Music Library and its linked Supabase Storage audio file?")) return;
    var msg=document.getElementById("mlSafeMsg");
    try{
      msg.textContent="🗑️ Deleting track and linked Supabase audio…";
      var r=await fetch(api("/api/music/library/"+encodeURIComponent(id)),{method:"DELETE",credentials:"include",headers:{"Accept":"application/json"}});
      var b=await r.json();
      if(!r.ok||!b.ok) throw new Error(b.error||("Delete failed: HTTP "+r.status));
      msg.textContent="✅ Track and linked Supabase audio deleted.";
      await load();
    }catch(e){
      msg.textContent="❌ Delete failed: "+(e.message||e);
    }
  }

  window.renderMusicLibrary=renderMusicLibrary;
  window.musicLibraryAdd=upload;

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",function(){});
  }
})();