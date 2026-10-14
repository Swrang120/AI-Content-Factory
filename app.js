const API_BASE=(window.ACF_BACKEND_URL||(location.hostname.endsWith(".vercel.app")?location.origin:"https://ai-content-factory-zeta-ruby.vercel.app")).replace(/\/+$/,"");
// Production backend: keep the frontend aligned with the GitHub/Vercel production project.
const apiUrl=p=>API_BASE+p;
const KEY="acf_v2";
const defaultData={
  categories:[
    {id:"music",icon:"🎵",name:"Music Promotion",desc:"Promote songs, artists, releases and music stories.",enabled:true},
    {id:"news",icon:"📰",name:"News & Updates",desc:"Research-backed current updates with source tracking.",enabled:true},
    {id:"product",icon:"🛍️",name:"Product Promotion",desc:"Create product explainers, demos and promotional videos.",enabled:true},
    {id:"sports",icon:"⚽",name:"Sports Information",desc:"Match, player and sports-information content.",enabled:true},
    {id:"editing",icon:"🎬",name:"Editing Knowledge",desc:"Video editing, creator tips and tutorials.",enabled:true},
    {id:"tech",icon:"🤖",name:"AI & Technology",desc:"Tools, workflows and technology explainers.",enabled:true}
  ],
  content:[
    {id:1,title:"Welcome to AI Content Factory",category:"Editing Knowledge",format:"Short Video",language:"English",status:"Ready",notes:"Foundation demo item."},
    {id:2,title:"Music Promotion Workflow",category:"Music Promotion",format:"Reel",language:"Hindi + Bodo",status:"Planned",notes:"Future AI pipeline."},
    {id:3,title:"Product Promotion Template",category:"Product Promotion",format:"Promo",language:"Hindi",status:"Idea",notes:"Connect product research later."}
  ],
  schedule:[],
  settings:{automationOnline:true,autoGenerate:true,approval:false,autoPublish:true}
};
let data=JSON.parse(localStorage.getItem(KEY)||"null")||defaultData;
let contentSyncTimer=null;
async function syncReadyContent(){
  try{
    const ready=(data.content||[]).filter(x=>String(x.status||"").toLowerCase()==="ready").slice(0,50);
    if(!ready.length)return;
    await fetch(apiUrl("/api/content/sync"),{
      method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",
      body:JSON.stringify({items:ready})
    });
  }catch(_){}
}
const save=()=>{
  localStorage.setItem(KEY,JSON.stringify(data));
  clearTimeout(contentSyncTimer);
  contentSyncTimer=setTimeout(syncReadyContent,350);
};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const statusClass=s=>String(s).toLowerCase().replace(/\s/g,"");
const view=document.getElementById("view");
const title=document.getElementById("page-title");
const AI_ROBOTS=[
 {id:"manager",icon:"🧠",name:"Factory Manager",role:"Orchestrator",task:"Assigns jobs and controls the production pipeline.",status:"Active",progress:82},
 {id:"research",icon:"🔎",name:"Research Bot",role:"Research & Sources",task:"Collects source material before content generation.",status:"Standby",progress:18},
 {id:"script",icon:"✍️",name:"Script Bot",role:"Script Writer",task:"Turns approved ideas and research into scripts.",status:"Active",progress:64},
 {id:"voice",icon:"🎙️",name:"Voice Bot",role:"Voice Production",task:"Prepares narration and voice-production jobs.",status:"Standby",progress:0},
 {id:"visual",icon:"🖼️",name:"Visual Bot",role:"Visual Planner",task:"Plans scenes, B-roll and visual assets.",status:"Standby",progress:0},
 {id:"editor",icon:"🎬",name:"Editor Bot",role:"Video Editor",task:"Builds the timeline from approved media assets.",status:"Standby",progress:0},
 {id:"thumb",icon:"🎨",name:"Thumbnail Bot",role:"Thumbnail Designer",task:"Creates thumbnail concepts, text and composition briefs.",status:"Standby",progress:0},
 {id:"qa",icon:"🛡️",name:"QA & Rights Bot",role:"Quality / Copyright",task:"Checks sources, originality, metadata and approval gates.",status:"Active",progress:36},
 {id:"publisher",icon:"📤",name:"Publisher Bot",role:"Platform Publisher",task:"Queues approved videos for connected platforms.",status:"Standby",progress:0},
 {id:"analytics",icon:"📊",name:"Analytics Bot",role:"Performance Monitor",task:"Tracks published content and reports performance.",status:"Standby",progress:0}
];
let liveAgents={};
let agentPollTimer=null;
function agentStateFor(r){
  const a=liveAgents[r.id]||{};
  return {...r,status:String(a.status||r.status).toUpperCase(),progress:Number(a.progress??r.progress)||0,task:a.task||r.task,jobId:a.jobId||null};
}
function applyAgentToDom(r){
  const a=agentStateFor(r), working=a.status==="WORKING"||a.status==="MEETING";
  const card=document.getElementById("employee-"+r.id);
  if(card){
    card.classList.toggle("employee-working",working);
    card.classList.toggle("employee-sleeping",a.status==="SLEEPING");
    const state=card.querySelector(".employee-state"); if(state)state.textContent=working?"Working":a.status==="ERROR"?"Error":"Sleeping";
    const char=card.querySelector(".employee-character"); if(char)char.classList.toggle("working",working);
  }
  const office=document.getElementById("office-worker-"+r.id);
  if(office){
    office.classList.toggle("office-working",working);
    office.classList.toggle("office-sleeping",!working);
    office.classList.toggle("office-error",a.status==="ERROR");
    office.dataset.state=a.status;
    office.title=(working?"Working: ":"Sleeping: ")+a.task;
    const task=office.querySelector(".office-task"); if(task)task.textContent=working?a.task:"Sleeping";
    const bubble=office.querySelector(".office-bubble"); if(bubble)bubble.textContent=working?"WORKING":"Zzz";
  }
  const summary=document.getElementById("robot-summary-"+r.id);
  if(summary){
    summary.className="robot-card "+(working?"live-working":"live-sleeping");
    const st=summary.querySelector(".robot-status"); if(st){st.className="robot-status "+(working?"":"idle");st.innerHTML="<i></i>"+(working?"Working":a.status==="ERROR"?"Error":"Sleeping");}
    const task=summary.querySelector(".robot-task"); if(task)task.textContent=a.task;
    const bar=summary.querySelector(".robot-bar i"); if(bar)bar.style.width=a.progress+"%";
    const meta=summary.querySelector(".robot-meta"); if(meta)meta.innerHTML="<span>"+(working?"Working":"Sleeping")+"</span><span>"+a.progress+"%</span>";
  }
}
async function loadAgentStates(){
  try{
    const r=await fetch(apiUrl("/api/agents/state"),{credentials:"include",cache:"no-store"});
    const s=await r.json();
    if(s.ok&&s.agents){
      liveAgents=s.agents;
      AI_ROBOTS.forEach(applyAgentToDom);
      const active=Object.values(liveAgents).filter(x=>x.status==="WORKING"||x.status==="MEETING").length;
      document.querySelectorAll(".robot-metric-active").forEach(x=>x.textContent=active);
      document.querySelectorAll(".robot-live-badge").forEach(x=>{x.textContent=active?"LIVE · "+active+" WORKING":"ALL EMPLOYEES SLEEPING";x.className="badge "+(active?"ready":"")});
    }
  }catch(_){}
}
function startAgentPolling(){
  if(agentPollTimer)clearInterval(agentPollTimer);
  loadAgentStates();
  agentPollTimer=setInterval(()=>{
    const activeView=document.querySelector(".nav-item.active")?.dataset.view;
    if(activeView==="robots"||activeView==="boss")loadAgentStates();
  },3000);
}
function robotCard(r){
 const a=agentStateFor(r),working=a.status==="WORKING"||a.status==="MEETING";
 return `<div class="robot-card ${working?"live-working":"live-sleeping"}" id="robot-summary-${r.id}"><div class="robot-top"><div class="robot-avatar">${r.icon}</div><div><div class="robot-name">${r.name}</div><div class="robot-role">${r.role}</div></div><div class="robot-status ${working?"":"idle"}"><i></i>${working?"Working":a.status==="ERROR"?"Error":"Sleeping"}</div></div><div class="robot-task">${esc(a.task)}</div><div class="robot-bar"><i style="width:${a.progress}%"></i></div><div class="robot-meta"><span>${working?"Working":"Sleeping"}</span><span>${a.progress}%</span></div></div>`;
}
let videoGenController=null;
let videoGenHistory=JSON.parse(localStorage.getItem("acf_video_gen_history")||"[]");
function renderVideoGenerator(){
 title.textContent="Video Generator";
 view.innerHTML=`<div class="hero"><p class="eyebrow">AI CONTENT FACTORY · STUDIO</p><h2>Create, preview, publish</h2><p>Select the content type, language and duration. Generated videos stay in this browser history until you delete them; publishing is always a separate action.</p></div>
 <div class="card" style="padding:16px;border-radius:18px"><div class="form-grid"><label>Content category<select id="vgCategory"><option>Music Promotion</option><option>News &amp; Updates</option><option>Product Promotion</option><option>Sports Information</option><option>Editing Knowledge</option><option>AI &amp; Technology</option></select></label><label>Language<select id="vgLanguage"><option>Hindi</option><option>Hindi + English</option><option>English</option><option>Bodo</option><option>Hindi + Bodo</option><option>Assamese</option></select></label><label>Format<select id="vgFormat"><option value="Short Reel">Short Reel · 15–30 sec</option><option value="Reel">Reel · 30–60 sec</option><option value="Long Video">Long Video · 3–8 min</option><option value="YouTube Short">YouTube Short · up to 60 sec</option></select></label><label>Video frame<select id="vgFrame"><option value="9:16" selected>📱 Vertical 9:16 · YouTube Shorts / Reels</option><option value="16:9">🖥️ Landscape 16:9 · YouTube long video</option><option value="1:1">⬜ Square 1:1 · Feed post</option></select></label></div><label>Script idea / topic<textarea id="vgIdea" rows="4" placeholder="Music Library mein active original song ke liye trending-style hook ke saath promotion reel banao"></textarea></label><div class="quick-actions"><button class="primary" id="vgGenerate">✨ Generate Preview</button><button class="small-btn" id="vgStop" disabled>⏹ Stop request</button><button class="small-btn" id="vgPublish" disabled>📤 Publish latest</button><button class="small-btn" id="vgDelete" disabled>🗑 Delete current</button></div><div id="vgStatus" class="boss-result" aria-live="polite">Ready. Video generate karne ke liye details bharo.</div><div id="vgPreview"></div></div><div class="card" style="padding:16px;border-radius:18px;margin-top:16px"><h3>Previous generations</h3><div id="vgHistory"></div></div>`;
 const status=document.getElementById("vgStatus"),preview=document.getElementById("vgPreview");
 const vgFormatSelect=document.getElementById("vgFormat"),vgFrameSelect=document.getElementById("vgFrame");
 function syncVideoFrame(){if(/YouTube Short|Short Reel|^Reel$/.test(vgFormatSelect.value)){vgFrameSelect.value="9:16";vgFrameSelect.disabled=true;}else{vgFrameSelect.disabled=false;}}
 vgFormatSelect.addEventListener("change",syncVideoFrame);syncVideoFrame();
 let current=null;
 function drawHistory(){const el=document.getElementById("vgHistory");if(!videoGenHistory.length){el.textContent="No previous video in this browser yet.";return;}el.innerHTML=videoGenHistory.map((x,i)=>'<div style="padding:12px 0;border-bottom:1px solid #263748"><b>'+esc(x.title||x.category||"Video")+'</b><div style="font-size:12px;color:#9bb2c5">'+esc(x.language||"")+' · '+esc(x.format||"")+' · '+esc(x.date||"")+'</div><button class="small-btn" data-vg-prev="'+i+'">Preview</button> <button class="small-btn" data-vg-pub="'+i+'">Publish</button> <button class="small-btn" data-vg-del="'+i+'">Delete</button></div>').join("");el.querySelectorAll("[data-vg-prev]").forEach(b=>b.onclick=()=>{current=videoGenHistory[+b.dataset.vgPrev];showPreview(current);});el.querySelectorAll("[data-vg-pub]").forEach(b=>b.onclick=()=>publishItem(videoGenHistory[+b.dataset.vgPub]));el.querySelectorAll("[data-vg-del]").forEach(b=>b.onclick=()=>{videoGenHistory.splice(+b.dataset.vgDel,1);localStorage.setItem("acf_video_gen_history",JSON.stringify(videoGenHistory));drawHistory();});}
 function showPreview(item){preview.innerHTML="";if(!item?.url){status.textContent="This history entry has no playable preview URL.";return;}const v=document.createElement("video");v.controls=true;v.playsInline=true;v.preload="metadata";v.src=item.url;v.style.cssText="width:100%;max-height:65vh;background:#000;border-radius:14px;margin-top:12px";preview.appendChild(v);status.textContent=(item.title||item.category||"Video")+" · Preview ready";document.getElementById("vgPublish").disabled=false;document.getElementById("vgDelete").disabled=false;}
 async function publishItem(item){try{status.textContent="Sending latest generated video to Buffer…";const r=await fetch(apiUrl("/api/boss/publish-latest"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({command:"publish latest video",renderedVideoUrl:item?.url,jobId:item?.jobId,category:item?.category,title:item?.title,language:item?.language,format:item?.format})});const b=await r.json().catch(()=>({}));if(!r.ok||!b.ok)throw new Error(b.error||"Publish failed");status.textContent="Buffer accepted the publish request: "+(b.status||"sent_to_buffer");}catch(e){status.textContent="Publish failed: "+e.message;}}
 document.getElementById("vgGenerate").onclick=async()=>{const category=document.getElementById("vgCategory").value,language=document.getElementById("vgLanguage").value,format=document.getElementById("vgFormat").value,aspectRatio=(/YouTube Short|Short Reel|^Reel$/.test(format)||format==="Reel"?"9:16":document.getElementById("vgFrame").value),idea=document.getElementById("vgIdea").value.trim();if(!idea){status.textContent="Please write a script idea first.";return;}if(videoGenController)videoGenController.abort();videoGenController=new AbortController();document.getElementById("vgGenerate").disabled=true;document.getElementById("vgStop").disabled=false;status.textContent="Manager → Script → Voice → Editor → QA: generating preview…";preview.innerHTML="";try{const command="Category: "+category+" | Language: "+language+" | Format: "+format+" | Frame: "+aspectRatio+" | Script idea: "+idea;const r=await fetch(apiUrl("/api/boss/command"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",signal:videoGenController.signal,body:JSON.stringify({command,category,language,format,aspectRatio,idea})});const b=await r.json().catch(()=>({}));if(!r.ok||!b.ok)throw new Error(b.error||"Generation failed");current={jobId:b.jobId,url:b.renderedVideoUrl,title:b.title||idea,category,language,format,aspectRatio,date:new Date().toLocaleString()};if(!current.url)throw new Error("Backend returned no rendered video URL.");videoGenHistory.unshift(current);videoGenHistory=videoGenHistory.slice(0,10);localStorage.setItem("acf_video_gen_history",JSON.stringify(videoGenHistory));showPreview(current);status.textContent="Video ready for preview. It has not been published.";drawHistory();}catch(e){status.textContent=e.name==="AbortError"?"Request cancelled in this browser. The server may continue any work already started.":"Generation failed: "+e.message;}finally{videoGenController=null;document.getElementById("vgGenerate").disabled=false;document.getElementById("vgStop").disabled=true;}};
 document.getElementById("vgStop").onclick=()=>{if(videoGenController)videoGenController.abort();status.textContent="Cancel requested. If rendering already started on the server, this button cannot guarantee server-side cancellation.";};
 document.getElementById("vgPublish").onclick=()=>publishItem(current);
 document.getElementById("vgDelete").onclick=()=>{if(current){videoGenHistory=videoGenHistory.filter(x=>x!==current);localStorage.setItem("acf_video_gen_history",JSON.stringify(videoGenHistory));current=null;preview.innerHTML="";status.textContent="Removed from this browser history. This does not delete the stored media file.";document.getElementById("vgPublish").disabled=true;document.getElementById("vgDelete").disabled=true;drawHistory();}};
 drawHistory();
}
function renderBossRoom(){
 title.textContent="AI Office";
 const rooms={
  manager:["BOSS ROOM","6%","5%","25%","27%"],meeting:["AI & TECHNOLOGY","33%","5%","31%","27%"],strategy:["NEWS & UPDATES","66%","5%","28%","27%"],
  research:["SPORTS INFORMATION","6%","35%","30%","30%"],operations:["EDITING KNOWLEDGE","39%","35%","55%","30%"],
  lounge:["PRODUCT PROMOTION","6%","68%","30%","27%"],kitchen:["MUSIC PROMOTION","39%","68%","26%","27%"],server:["BOSS CONTROL CENTER","67%","68%","27%","27%"]
 };
 const roomFor={manager:"manager",research:"research",script:"operations",voice:"operations",visual:"operations",editor:"operations",thumb:"operations",qa:"operations",publisher:"server",analytics:"server"};
 view.innerHTML=`<div class="pixel-office-page screenshot-office">
   <div class="pixel-office-head"><div><p class="eyebrow">AI CONTENT FACTORY · VIRTUAL HQ</p><h2>🏢 AI Employee Office</h2><p>Exactly this style: a top-down dark pixel-art office where every AI employee physically moves between rooms, works at a desk, joins meetings, or rests when idle.</p></div><div class="office-live"><span></span><b id="officeLiveText">SYNCING</b></div></div>
   <div class="pixel-office-shell">
    <div class="office-toolbar"><div><b>FACTORY FLOOR</b><small>6 content rooms + separate Boss Room · click an AI worker to see its live task</small></div><div class="office-legend"><span><i class="legend-dot work"></i>Working</span><span><i class="legend-dot sleep"></i>Resting</span><span>🟣 Meeting</span></div></div>
    <div class="office-map">
      <div class="map-room manager-room boss-room"><b>BOSS ROOM · COMMAND</b><div class="map-desk big"></div><div class="map-monitor"></div><div class="map-plant p1">🌿</div><div class="map-plant p2">🌿</div></div>
      <div class="map-room meeting-room content-room ai-tech-room"><b>AI & TECHNOLOGY</b><div class="conference-table"></div><div class="meeting-chair c1"></div><div class="meeting-chair c2"></div><div class="meeting-chair c3"></div><div class="meeting-chair c4"></div><div class="meeting-chair c5"></div><div class="meeting-chair c6"></div><div class="whiteboard">PIPELINE<br><small>IDEA → PUBLISH</small></div></div>
      <div class="map-room strategy-room content-room news-room"><b>NEWS & UPDATES</b><div class="map-desk"></div><div class="map-monitor"></div><div class="map-cabinet"></div><div class="map-plant p2">🌿</div></div>
      <div class="map-room research-room content-room sports-room"><b>SPORTS INFORMATION</b><div class="work-desk d1"></div><div class="work-desk d2"></div><div class="map-monitor m1">⌕</div><div class="map-monitor m2">⌕</div><div class="shelf"></div></div>
      <div class="map-room operations-room content-room editing-room"><b>EDITING KNOWLEDGE</b><div class="work-desk od1"></div><div class="work-desk od2"></div><div class="work-desk od3"></div><div class="work-desk od4"></div><div class="work-desk od5"></div><div class="work-desk od6"></div><div class="map-monitor om1">✎</div><div class="map-monitor om2">♫</div><div class="map-monitor om3">▶</div><div class="map-monitor om4">✦</div><div class="map-monitor om5">✓</div><div class="map-monitor om6">↑</div></div>
      <div class="map-room lounge-room content-room product-room"><b>PRODUCT PROMOTION</b><div class="sofa"></div><div class="coffee-table"></div><div class="pool-table"></div><span class="coffee">☕</span><span class="plant-large">🌿</span></div>
      <div class="map-room kitchen-room content-room music-room"><b>MUSIC PROMOTION</b><div class="counter"></div><div class="fridge"></div><div class="cafe-table"></div><div class="cafe-chair a"></div><div class="cafe-chair b"></div><span class="coffee">☕</span></div>
      <div class="map-room server-room boss-control-room"><b>BOSS CONTROL CENTER</b><div class="server-wall"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="data-screen">AI FACTORY<br><small>LIVE DATA</small></div><div class="map-monitor sm">◈</div></div>
      <div class="map-corridor vertical"></div><div class="map-corridor horizontal"></div><div class="map-door dtop"></div><div class="map-door dleft"></div><div class="map-door dright"></div>
      <div class="office-worker-layer">${AI_ROBOTS.map((r,i)=>{
        const p=rooms[roomFor[r.id]||"operations"];
        const sleep=[18,28,38,48,58,68,78,27,47,67][i]||50;
        return `<button class="office-worker office-sleeping" id="office-worker-${r.id}" style="--desk-x:calc(${p[1]} + ${i%2?14:7}%);--desk-y:calc(${p[2]} + 13%);--sleep-x:${sleep}%;--sleep-y:93%" onclick="officeEmployeeClick('${r.id}')" aria-label="${r.name}">
          <div class="office-bubble">Zzz</div><div class="office-sprite"><div class="sprite-head">${r.icon}</div><div class="sprite-body"></div><div class="sprite-feet"></div></div><div class="office-name">${r.name.replace(" Bot","")}</div><div class="office-task">Sleeping</div>
        </button>`}).join("")}</div>
    </div>
   </div>
   <div class="office-status-strip" id="officeStatusStrip">Select an employee to see their live task.</div>
   <div class="boss-command office-command"><div class="command-label">BOSS COMMAND</div><div class="boss-config-grid"><label>Content category<select id="bossCategory"><option>Music Promotion</option><option>News &amp; Updates</option><option>Product Promotion</option><option>Sports Information</option><option>Editing Knowledge</option><option>AI &amp; Technology</option></select></label><label>Language<select id="bossLanguage"><option>Hindi</option><option>Hindi + English</option><option>English</option><option>Bodo</option><option>Hindi + Bodo</option><option>Assamese</option></select></label><label>Video format<select id="bossFormat"><option value="Short Reel">Short Reel (15–30 sec)</option><option value="Reel">Reel (30–60 sec)</option><option value="Long Video">Long Video (3–8 min)</option><option value="YouTube Short">YouTube Short (up to 60 sec)</option></select></label></div><label class="boss-idea-label" for="bossCommand">Script idea / topic</label><div class="command-row"><textarea id="bossCommand" rows="2" placeholder="Topic or script idea likho…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();bossCommandRun()}"></textarea><button class="small-btn voice-command-btn" id="bossVoiceBtn" onclick="startBossVoiceCommand()">🎙️ Speak</button><button class="primary" onclick="bossCommandRun()">⚡ Generate Preview</button></div><div class="quick-actions"><button class="small-btn" onclick="bossQuick('Create a new video idea')">🎬 New Video</button><button class="small-btn" onclick="bossQuick('Research a news topic')">🔎 Research</button><button class="small-btn" onclick="bossQuick('Write a YouTube script')">✍️ Script</button><button class="small-btn" onclick="bossQuick('Prepare a YouTube upload')">📤 Publish</button></div><div id="bossResult" class="boss-result">Waiting for the Boss order…</div></div>
 </div>`;
 loadAgentStates(); startAgentPolling();
}
function officeEmployeeClick(id){
 const r=AI_ROBOTS.find(x=>x.id===id),a=agentStateFor(r||{}),el=document.getElementById("officeStatusStrip");
 if(el&&r)el.innerHTML="<b>"+esc(r.name)+"</b> · "+(a.status==="WORKING"?"🟢 Working":"😴 Resting")+" · "+esc(a.task)+" · "+Number(a.progress||0)+"%";
}
function bossQuick(c){const i=document.getElementById("bossCommand");if(i){i.value=c;bossCommandRun();}}
let bossSpeech=null;
function startBossVoiceCommand(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const input=document.getElementById("bossCommand"),btn=document.getElementById("bossVoiceBtn"),result=document.getElementById("bossResult");
 if(!SpeechRecognition){if(result)result.textContent="Voice command is not supported in this browser. Use Chrome on Android/desktop.";return;}
 if(bossSpeech){try{bossSpeech.stop();}catch(_){}bossSpeech=null;return;}
 bossSpeech=new SpeechRecognition();
 bossSpeech.lang="hi-IN";
 bossSpeech.interimResults=false;
 bossSpeech.maxAlternatives=1;
 if(btn){btn.textContent="🛑 Listening…";btn.classList.add("voice-listening");}
 if(result)result.textContent="🎙️ Listening… say: “upload the latest video” or “create and publish a video”.";
 bossSpeech.onresult=e=>{
   const text=String(e.results?.[0]?.[0]?.transcript||"").trim();
   if(input)input.value=text;
   if(result)result.innerHTML="<b>Voice command:</b> "+esc(text);
   bossSpeech=null;
   if(btn){btn.textContent="🎙️ Speak";btn.classList.remove("voice-listening");}
   bossCommandRun();
 };
 bossSpeech.onerror=e=>{
   if(result)result.textContent="Voice command error: "+(e.error||"permission denied");
   bossSpeech=null;
   if(btn){btn.textContent="🎙️ Speak";btn.classList.remove("voice-listening");}
 };
 bossSpeech.onend=()=>{if(btn&&!bossSpeech){btn.textContent="🎙️ Speak";btn.classList.remove("voice-listening");}};
 try{bossSpeech.start();}catch(e){bossSpeech=null;if(btn){btn.textContent="🎙️ Speak";btn.classList.remove("voice-listening");}}
}
async function bossCommandRun(){
 const input=document.getElementById("bossCommand"),result=document.getElementById("bossResult"),badge=document.getElementById("bossLiveBadge"),idea=(input?.value||"").trim(),category=document.getElementById("bossCategory")?.value||"AI & Technology",language=document.getElementById("bossLanguage")?.value||"Hindi",format=document.getElementById("bossFormat")?.value||"Short Reel";if(!idea){if(result)result.textContent="Pehle category, language, format select karke script idea/topic likho.";return;}
 const command="Category: "+category+" | Language: "+language+" | Format: "+format+" | Script idea: "+idea;
 const w=(category+" "+idea).toLowerCase();let ids=["manager"];
 if(w.includes("research")||w.includes("news")||w.includes("fact"))ids.push("research");
 if(w.includes("script")||w.includes("write"))ids.push("script");
 if(w.includes("voice")||w.includes("audio"))ids.push("voice");
 if(w.includes("video")||w.includes("edit")||w.includes("reel"))ids.push("visual","editor");
 if(w.includes("thumbnail")||w.includes("poster"))ids.push("thumb");
 if(w.includes("publish")||w.includes("youtube")||w.includes("upload"))ids.push("qa","publisher");
 ids=[...new Set(ids)];
 const changes={};ids.forEach(id=>changes[id]={status:"WORKING",progress:10,task:"Working on Boss order: "+command.slice(0,150),jobId:null});
 liveAgents={...liveAgents,...changes};
 AI_ROBOTS.forEach(applyAgentToDom);
 if(badge){badge.textContent="EMPLOYEES WORKING";badge.className="badge ready robot-live-badge";}
 if(result)result.innerHTML="<b>Boss order:</b> "+esc(command)+"<br><span>Assigned: "+ids.map(id=>AI_ROBOTS.find(r=>r.id===id)?.name||id).join(" → ")+"</span>";
 if(/\b(publish|upload|post|send to buffer)\b/i.test(command) && !/\b(create|make|generate|build|new)\b/i.test(command)){
   try{
     if(result)result.innerHTML+="<br><span class='boss-output'>📤 Sending the latest generated video to Buffer…</span>";
     const pr=await fetch(apiUrl("/api/boss/publish-latest"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({command})});
     const pb=await pr.json().catch(()=>({}));
     if(!pr.ok||!pb.ok)throw new Error(pb.error||"Buffer publish request failed");
     if(result)result.innerHTML+="<br><span class='boss-output'>✓ Video sent to Buffer. Check Buffer Queue for YouTube, Instagram and Facebook Page. Buffer status: "+esc(pb.status||"sent_to_buffer")+"</span>";
   }catch(e){if(result)result.innerHTML+="<br><span class='boss-output'>Publish request failed: "+esc(e.message)+"</span>";}
 } else if(/\b(create|make|generate|build|video|content)\b/i.test(command)){
   try{
     if(result)result.innerHTML+="<br><span class='boss-output'>🤖 Manager → Research → Script → Voice → Editor → QA: generating your video…</span>";
     const pr=await fetch(apiUrl("/api/boss/command"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({command,category,language,format,idea})});
     const pb=await pr.json().catch(()=>({}));
     if(!pr.ok||!pb.ok)throw new Error(pb.error||"Boss video generation failed");
     if(result){result.innerHTML+="<br><span class='boss-output'>✓ Video generated. Job: "+esc(pb.jobId||"ready")+" · Status: "+esc(pb.status||"generated_ready")+". Review the preview before publishing.</span>";if(pb.renderedVideoUrl){const preview=document.createElement("div");preview.className="boss-video-preview";preview.style.cssText="margin-top:12px;padding:10px;border:1px solid #29465a;border-radius:12px;background:#07111f";const heading=document.createElement("div");heading.textContent=pb.track?("Music promo preview · "+(pb.track.title||pb.title||"Music Library track")):"Generated video preview";heading.style.cssText="font-weight:700;margin-bottom:8px;color:#d9e9f5";if(pb.promotionLine){const trend=document.createElement("div");trend.textContent="Hook line: "+pb.promotionLine;trend.style.cssText="font-size:13px;color:#f4d47b;margin-bottom:8px";preview.append(heading,trend);}else{preview.append(heading);}const video=document.createElement("video");video.controls=true;video.playsInline=true;video.preload="metadata";video.src=pb.renderedVideoUrl;video.style.cssText="display:block;width:100%;max-height:520px;border-radius:8px;background:#000";const note=document.createElement("div");note.textContent="Preview first, then send a separate publish command.";note.style.cssText="font-size:12px;color:#9bb2c5;margin-top:8px";preview.append(video,note);result.appendChild(preview);}}
   }catch(e){if(result)result.innerHTML+="<br><span class='boss-output'>Video generation failed: "+esc(e.message)+"</span>";}
 }
 try{await fetch(apiUrl("/api/agents/state"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({agents:changes})});}catch(_){}
 try{
   if(w.includes("script")||w.includes("idea")||w.includes("content")||w.includes("video")){
     const r=await fetch(apiUrl("/api/ai/generate"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"boss_command",topic:command,category:"AI Content Factory",language:"Hindi",format:"Short Video",notes:"Boss command. Return a concise actionable production brief in Hindi; do not invent current facts."})});
     const s=await r.json();
     if(s.ok&&result)result.innerHTML+="<br><span class='boss-output'>AI Manager result: "+esc(s.output).replace(/\n/g,"<br>")+"</span>";
   }
 }catch(e){if(result)result.innerHTML+="<br><span class='boss-output'>Command queued. Backend response unavailable.</span>";}
 setTimeout(async()=>{try{await fetch(apiUrl("/api/agents/state"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({agents:Object.fromEntries(ids.map(id=>[id,{status:"SLEEPING",progress:100,task:"Waiting for a job",jobId:null}]))})});}catch(_){}loadAgentStates();},7000);
}
function renderRobots(){
 title.textContent="AI Robots";
 const active=AI_ROBOTS.filter(r=>{const a=agentStateFor(r);return a.status==="WORKING"||a.status==="MEETING";}).length;
 view.innerHTML=`<div class="hero"><p class="eyebrow">AI CONTROL ROOM</p><h2>Every robot has one clear job.</h2><p>Live worker state is synchronized with the production backend. Working agents appear at their desks; idle agents sleep.</p></div>
 <div class="cards"><div class="card"><div class="metric-label">AI Robots</div><div class="metric">${AI_ROBOTS.length}</div><div class="metric-note">Configured roles</div></div><div class="card"><div class="metric-label">Active</div><div class="metric robot-metric-active">${active}</div><div class="metric-note">Working right now</div></div><div class="card"><div class="metric-label">Sleeping</div><div class="metric">${AI_ROBOTS.length-active}</div><div class="metric-note">Waiting for jobs</div></div><div class="card"><div class="metric-label">Pipeline</div><div class="metric">10</div><div class="metric-note">Production roles</div></div></div>
 <div class="robot-summary">${AI_ROBOTS.map(robotCard).join("")}</div>
 <div class="robot-grid"><div class="robot-panel"><div class="robot-header"><h3>Live Activity</h3><small>Backend worker events</small></div>
 <div class="robot-log"><b>LIVE</b><span>Factory Manager assigns work as the pipeline runs.</span></div>
 <div class="robot-log"><b>SYNC</b><span>Research → Script → Voice → Editor → QA → Publisher.</span></div>
 <div class="robot-log"><b>READY</b><span>When no job is active, employees return to sleep.</span></div></div>
 <div class="robot-panel"><div class="robot-header"><h3>Production Chain</h3><small>Idea → Publish</small></div>
 <div class="pipeline"><div class="stage"><strong>01</strong><span>RESEARCH</span></div><div class="stage"><strong>02</strong><span>SCRIPT</span></div><div class="stage"><strong>03</strong><span>VOICE</span></div><div class="stage"><strong>04</strong><span>VIDEO</span></div><div class="stage"><strong>05</strong><span>PUBLISH</span></div></div></div></div>`;
 loadAgentStates();
 startAgentPolling();
}
function renderDashboard(){
  title.textContent="Dashboard";
  const counts={Idea:0,Planned:0,Ready:0,Approval:0};
  data.content.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
  view.innerHTML=`
  <div class="hero"><p class="eyebrow">PRIVATE AI WORKSPACE</p><h2>Your content production command center.</h2><p>Generate, review, schedule and publish from one workspace. YouTube publishing is connected through the secure server adapter.</p></div>
  <div class="cards">
    <div class="card"><div class="metric-label">Total Content</div><div class="metric">${data.content.length}</div><div class="metric-note">In your queue</div></div>
    <div class="card"><div class="metric-label">Ready</div><div class="metric">${counts.Ready||0}</div><div class="metric-note">Production-ready</div></div>
    <div class="card"><div class="metric-label">Scheduled</div><div class="metric">${data.schedule.length}</div><div class="metric-note">Publishing slots</div></div>
    <div class="card"><div class="metric-label">Categories</div><div class="metric">${data.categories.filter(x=>x.enabled).length}</div><div class="metric-note">Active categories</div></div>
  </div>
  <div class="table-card">
    <div class="section-head"><div><h3>YouTube Connection</h3><span class="muted">Live status from the secure backend.</span></div><span id="dashboardYtBadge" class="badge">Checking…</span></div>
    <div class="platform"><div><div class="platform-name">YouTube</div><small id="dashboardYtText">Checking connected channel…</small></div><div class="platform-actions"><button class="small-btn" onclick="setView('accounts')">Manage</button></div></div>
  </div>
  <div class="table-card">
    <div class="section-head"><div><h3>📊 Creator Analytics & Learning</h3><span class="muted">The factory studies your own performance and turns patterns into the next experiments.</span></div><button class="small-btn" onclick="loadCreatorLearning()">Refresh</button></div>
    <div id="creatorAnalytics" class="muted">Loading performance data…</div>
  </div>
  <div class="table-card"><div class="section-head"><div><h3>AI Robot Control Room</h3><span class="muted">See which AI role is working, waiting or ready.</span></div><button class="small-btn" onclick="setView('robots')">Open Robot Room</button></div><div class="robot-summary">${AI_ROBOTS.slice(0,6).map(robotCard).join("")}</div></div>
  <div class="two-col">
    <div class="table-card"><div class="section-head"><h3>Production Pipeline</h3><span class="badge">YouTube adapter ready</span></div><div class="pipeline">
      <div class="stage"><strong>${counts.Idea||0}</strong><span>IDEAS</span></div><div class="stage"><strong>${counts.Planned||0}</strong><span>PLANNED</span></div><div class="stage"><strong>${counts.Ready||0}</strong><span>READY</span></div><div class="stage"><strong>${counts.Approval||0}</strong><span>APPROVAL</span></div><div class="stage"><strong id="dashboardYtStage">—</strong><span>YOUTUBE</span></div>
    </div></div>
    <div class="table-card"><div class="section-head"><h3>Latest Content</h3><button class="small-btn" onclick="setView('content')">View all</button></div>
      ${data.content.slice(-4).reverse().map(x=>`<div class="queue-row"><div><div class="queue-title">${esc(x.title)}</div><div class="queue-meta">${esc(x.category)} · ${esc(x.format)}</div></div><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></div>`).join("")||'<div class="empty">No content yet.</div>'}
    </div>
  </div>`;
  metaStatus().then(s=>{const fb=document.getElementById("fbBadge"),ig=document.getElementById("igBadge"),ft=document.getElementById("fbStatusText"),it=document.getElementById("igStatusText"); if(!fb||!ig)return; if(s.connected&&s.page){fb.textContent="Connected";fb.className="badge ready";if(ft)ft.textContent="Page: "+s.page.name; if(s.instagram){ig.textContent="Connected";ig.className="badge ready";if(it)it.textContent="Instagram Professional connected";}else{ig.textContent="Needs IG";if(it)it.textContent="Connect an Instagram Professional account to the Facebook Page.";}}else{fb.textContent=s.configured?"Not connected":"Setup needed";ig.textContent=s.configured?"Not connected":"Setup needed";}});
  youtubeStatus().then(s=>{
    const badge=document.getElementById("dashboardYtBadge");
    const textEl=document.getElementById("dashboardYtText");
    const stage=document.getElementById("dashboardYtStage");
    if(!badge||!textEl)return;
    if(s.connected){
      badge.textContent="Connected";
      badge.className="badge ready";
      textEl.textContent="Channel: "+(s.channel?.title||"Connected")+" · "+(s.channel?.subscribers||"—")+" subscribers";
      if(stage)stage.textContent="✓";
    }else{
      badge.textContent="Not connected";
      badge.className="badge";
      textEl.textContent=s.error||"Connect your YouTube channel";
      if(stage)stage.textContent="—";
    }
  });
}
async function uploadFactoryVideo(){
  const file=document.getElementById("factoryUploadFile")?.files?.[0], titleInput=document.getElementById("factoryUploadTitle"), result=document.getElementById("factoryUploadResult");
  if(!file){result.textContent="Choose a video file first.";return;}
  const isLikelyVideo=file.type.startsWith("video/")||/\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|3gp|wmv|flv)$/i.test(file.name)||!file.type;
  if(!isLikelyVideo){result.textContent="Please choose a video file.";return;}
  if(file.size>50*1024*1024){result.textContent="Video is larger than the current 50 MB upload limit.";return;}
  const title=(titleInput?.value||file.name).trim()||"AI Content Factory Upload";
  result.textContent="Checking Factory storage…";
  try{
    // Factory storage is optional. If Blob presigning fails (including a network
    // error), fall back to a direct YouTube upload instead of aborting the upload.
    let storageReady=false;
    try{
      const pr=await fetch(apiUrl("/api/media/presign"),{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",
        body:JSON.stringify({filename:file.name,contentType:file.type||"video/mp4"})
      });
      const pj=await pr.json().catch(()=>({}));
      if(pr.ok&&pj.ok){
        result.textContent="Uploading to Factory storage…";
        const up=await fetch(pj.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type||"video/mp4"},body:file});
        if(!up.ok)throw new Error("Factory storage upload failed ("+up.status+")");
        const completed=await fetch(apiUrl("/api/media/complete-upload"),{
          method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",
          body:JSON.stringify({url:"https://"+new URL(pj.uploadUrl).hostname+"/"+pj.pathname,pathname:pj.pathname,title,filename:file.name,size:file.size,contentType:file.type||"video/mp4"})
        });
        const body=await completed.json().catch(()=>({}));
        if(!completed.ok||!body.ok)throw new Error(body.error||"Upload completed but job creation failed");
        result.innerHTML='<span style="color:var(--accent)">✓ Uploaded to Factory.</span><br><small>'+esc(body.title)+' · '+Math.round((body.size||0)/1024/1024*10)/10+' MB · Scheduled '+esc(body.scheduledSlot||"next slot")+'</small><br><a href="'+esc(body.url)+'" target="_blank" rel="noopener">Open uploaded video</a>';
        storageReady=true;
      }
    }catch(storageError){
      console.warn("Factory storage unavailable; using YouTube fallback:",storageError);
    }
    if(storageReady)return;

    result.textContent="Factory storage unavailable. Uploading directly to YouTube as PRIVATE…";
    const params=new URLSearchParams({title,privacyStatus:"private",categoryId:"22"});
    const yt=await fetch(apiUrl("/api/youtube/upload-file?"+params.toString()),{
      method:"POST",headers:{"Content-Type":file.type||"video/mp4"},credentials:"include",body:file
    });
    const yb=await yt.json().catch(()=>({}));
    if(!yt.ok||!yb.ok)throw new Error(yb.error||"YouTube private upload failed");
    result.innerHTML='<span style="color:var(--accent)">✓ Uploaded to YouTube as PRIVATE.</span><br><small>'+esc(title)+'</small><br><a href="'+esc(yb.url||"")+'" target="_blank" rel="noopener">Open YouTube video</a>';
  }catch(e){result.textContent="Upload failed: "+e.message;}
}
function renderContent(){
  title.textContent="Content";
  view.innerHTML=`<div class="table-card">
    <div class="section-head"><div><h3>Content Queue</h3><span class="muted">Ideas, planned videos and AI-generated assets.</span></div><button class="primary" onclick="openModal()">＋ Add Content</button></div>
    <div class="table-card" style="margin:14px 0;background:#0a1726">
      <div class="section-head"><div><h3>🎵 Original Music Promotion</h3><span class="muted">Paste your Spotify track link + upload your original audio. The factory analyzes the song, finds a strong hook, cuts it and builds a YouTube promo.</span></div><span class="badge ready">ORIGINAL SONG ONLY</span></div>
      <label>Spotify Track Link<input id="musicSpotifyUrl" placeholder="https://open.spotify.com/track/..."></label>
      <div class="form-grid">
        <label>Original Song Audio<input id="musicAudioFile" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,.mp3,.wav,.m4a"></label>
        <label>Language<select id="musicPromoLanguage"><option>Hindi + Bodo</option><option>Hindi</option><option>Bodo</option><option>English</option></select></label>
      </div>
      <label>Promotion Notes<textarea id="musicPromoNotes" rows="2" placeholder="Optional: romantic, emotional, 90s Bollywood feel, artist CTA, etc."></textarea></label>
      <div id="musicTrackInfo" class="muted" style="margin:8px 0">Spotify metadata will appear here.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="small-btn" onclick="readMusicTrack()">🔎 Read Spotify Track</button>
        <button class="primary" onclick="createMusicPromotion()">🎬 Create Music Promo</button>
      </div>
      <div id="musicPromoResult" class="muted" style="margin-top:10px">The Spotify link identifies the release; the original audio file is used for the actual song clip.</div>
    </div>
    <div class="table-card" style="margin:14px 0;background:#0a1726">
      <div class="section-head"><div><h3>📤 Upload Video to Factory</h3><span class="muted">Add your own video to the media library.</span></div><span class="badge">Max 50 MB</span></div>
      <div class="form-grid"><label>Video title<input id="factoryUploadTitle" placeholder="My original video"></label><label>Video file<input id="factoryUploadFile" type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv,.mpeg,.mpg,.3gp,.wmv,.flv"></label></div>
      <button class="primary full" onclick="uploadFactoryVideo()">📤 Upload to Factory</button><div id="factoryUploadResult" class="muted" style="margin-top:10px">Nothing uploaded yet.</div>
    </div>
    <table class="table"><thead><tr><th>Title</th><th>Category</th><th>Format</th><th>Language</th><th>Status</th></tr></thead><tbody>${data.content.map(x=>`<tr><td><strong>${esc(x.title)}</strong></td><td>${esc(x.category)}</td><td>${esc(x.format)}</td><td>${esc(x.language)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td></tr>`).join("")}</tbody></table>
  </div>`;
}
async function readMusicTrack(){
  const input=document.getElementById("musicSpotifyUrl"),info=document.getElementById("musicTrackInfo");
  const url=(input?.value||"").trim(); if(!url){info.textContent="Paste a Spotify track link first.";return;}
  info.textContent="Reading Spotify track…";
  try{
    const r=await fetch(apiUrl("/api/music/track?url="+encodeURIComponent(url)),{credentials:"include"});
    const b=await r.json(); if(!r.ok||!b.ok)throw new Error(b.error||"Spotify metadata lookup failed");
    info.innerHTML="<b>🎵 "+esc(b.track.title||"Unknown title")+"</b> · "+esc(b.track.artist||"Unknown artist")+"<br><small>Spotify track recognized. Your uploaded original audio will be used for the clip.</small>";
  }catch(e){info.textContent="Spotify lookup failed: "+e.message;}
}
async function uploadMusicAudio(file){ const q=new URLSearchParams({filename:file.name,title:"Original Music Source"}); const r=await fetch(apiUrl("/api/media/upload-file?"+q.toString()),{method:"POST",headers:{"Content-Type":file.type||"audio/mpeg"},credentials:"include",body:file}); const b=await r.json().catch(()=>({})); if(!r.ok||!b.ok)throw new Error(b.error||"Original song upload failed"); return b.url; }
async function createMusicPromotion(){
  const spotifyUrl=(document.getElementById("musicSpotifyUrl")?.value||"").trim();
  const file=document.getElementById("musicAudioFile")?.files?.[0];
  const language=document.getElementById("musicPromoLanguage")?.value||"Hindi + Bodo";
  const notes=document.getElementById("musicPromoNotes")?.value||"";
  const out=document.getElementById("musicPromoResult");
  if(!spotifyUrl){out.textContent="Paste your Spotify track link first.";return;}
  if(!file){out.textContent="Upload the original song audio too.";return;}
  out.textContent="🎵 Uploading original audio…";
  try{
    await readMusicTrack();
    const audioUrl=await uploadMusicAudio(file);
    out.textContent="🤖 AI is transcribing the song and selecting the strongest hook…";
    const r=await fetch(apiUrl("/api/music/promotion"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({spotifyUrl,audioUrl,language,notes})});
    const b=await r.json(); if(!r.ok||!b.ok)throw new Error(b.error||"Music promotion failed");
    out.innerHTML="✓ <b>"+esc(b.track?.title||"Music promo")+"</b> — "+esc(b.status)+"<br>🎯 Hook: "+esc(b.hook?.hookText||"Selected automatically")+"<br>"+(b.video?.url?'<a href="'+esc(b.video.url)+'" target="_blank" rel="noopener">Open YouTube promo</a>':"Video rendered and queued.");
  }catch(e){out.textContent="Music promotion failed: "+e.message;}
}
function renderCategories(){
  title.textContent="Categories";
  view.innerHTML=`<div class="grid">${data.categories.map(c=>`<div class="category-card"><div class="category-icon">${c.icon}</div><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><div class="category-actions"><span class="badge ${c.enabled?"ready":""}">${c.enabled?"Active":"Disabled"}</span><button class="small-btn" onclick="toggleCategory('${c.id}')">${c.enabled?"Disable":"Enable"}</button></div></div>`).join("")}</div>`;
}
async function renderSchedule(){
  title.textContent="Live Stream";
  view.innerHTML=`<div class="hero"><p class="eyebrow">MANUAL LIVE CONTROL</p><h2>🎮 Live Stream</h2><p>Automatic weekly live schedule is disabled. You decide when to start and stop your live stream.</p></div>
  <div class="table-card"><div class="section-head"><div><h3>📡 Live stream status</h3><span class="muted">YouTube Live · Asia/Kolkata</span></div><button class="small-btn" id="liveRefresh">↻ Refresh status</button></div><div id="liveStatusPanel"><div class="empty">Checking live status…</div></div>
  <div class="queue-meta" style="margin-top:12px">Important: this page checks the current live-worker status. Starting a YouTube event does not by itself create the cartoon-car gameplay source; that still needs to be configured and tested.</div></div>`;
  async function refresh(){
    const box=document.getElementById("liveStatusPanel"); if(!box)return;
    try{
      const r=await fetch(apiUrl("/api/live/status"),{cache:"no-store",credentials:"include"});
      const s=await r.json(); if(!r.ok||!s.ok)throw new Error(s.error||"Live status unavailable");
      const latest=s.jobs?.[0]; const state=latest?.status||"No live event";
      box.innerHTML='<div class="queue-row"><div><div class="queue-title">Worker: '+(s.workerConfigured?'Configured':'Not configured')+'</div><div class="queue-meta">Latest event: '+esc(state)+'</div>'+(latest?.title?'<div class="queue-meta">'+esc(latest.title)+'</div>':'')+'</div><span class="badge '+(latest?.status==="live"?'ready':'')+'">'+esc(state)+'</span></div><div class="queue-meta" style="margin-top:8px">Automatic schedule: OFF</div>';
    }catch(e){box.innerHTML='<div class="empty">Live status error: '+esc(e.message)+'</div>';}
  }
  document.getElementById("liveRefresh")?.addEventListener("click",refresh); await refresh();
}
async function loadCreatorLearning(){
  const box=document.getElementById("creatorAnalytics");
  if(!box)return;
  box.innerHTML='<div class="empty">Reading your YouTube performance and preparing learning recommendations…</div>';
  try{
    const r=await fetch(apiUrl("/api/youtube/learning"),{credentials:"include"});
    const s=await r.json();
    if(!r.ok||!s.ok)throw new Error(s.error||"YouTube learning unavailable");
    const t=s.total||s.analyticsSummary?.total||{};
    const strategy=s.strategy||{};
    const winners=Array.isArray(strategy.winners)?strategy.winners:[];
    const patterns=Array.isArray(strategy.patterns)?strategy.patterns:[];
    const experiments=Array.isArray(strategy.experiments)?strategy.experiments:[];
    const avoid=Array.isArray(strategy.avoid)?strategy.avoid:[];
    const ideas=Array.isArray(strategy.nextIdeas)?strategy.nextIdeas:[];
    const list=(items,empty)=>items.length?'<ul style="margin:8px 0 0;padding-left:20px">'+items.map(x=>'<li style="margin:5px 0">'+esc(typeof x==="string"?x:JSON.stringify(x))+'</li>').join("")+'</ul>':'<div class="muted" style="margin-top:6px">'+empty+'</div>';
    box.innerHTML=`<div class="cards" style="margin:0 0 12px">
      <div class="card"><div class="metric-label">Views</div><div class="metric">${Number(t.views||0).toLocaleString()}</div><div class="metric-note">Last 28 days · processed</div></div>
      <div class="card"><div class="metric-label">Watch Minutes</div><div class="metric">${Number(t.estimatedMinutesWatched||0).toLocaleString()}</div><div class="metric-note">Watch time</div></div>
      <div class="card"><div class="metric-label">Likes</div><div class="metric">${Number(t.likes||0).toLocaleString()}</div><div class="metric-note">Engagement</div></div>
      <div class="card"><div class="metric-label">Subscribers</div><div class="metric">+${Number(t.subscribersGained||0).toLocaleString()}</div><div class="metric-note">Gained in period</div></div>
    </div>
    <div class="table-card"><div class="section-head"><h3>🏆 Best-performing videos</h3><span class="badge ready">Analytics</span></div>
      ${list((s.analyticsSummary?.topVideos||[]).slice(0,5).map(v=>(v.video||"Video")+": "+Number(v.views||0).toLocaleString()+" views"),"No video-level results were returned for this period.")}
    </div>
    <div class="table-card" style="margin-top:12px"><div class="section-head"><h3>🧠 What the AI learned</h3><span class="badge ready">Learning report</span></div>
      <h4>Winning patterns</h4>${list(winners,"Not enough evidence yet; connect YouTube Analytics and try again.")}
      <h4>Patterns to test</h4>${list(patterns,"No clear pattern returned yet.")}
      <h4>Next experiments</h4>${list(experiments,"No experiments returned yet.")}
      <h4>What to avoid</h4>${list(avoid,"No avoid-list returned yet.")}
      <h4>Next video ideas</h4>${list(ideas,"No new ideas returned yet.")}
    </div>
    <div class="muted" style="margin-top:8px">${esc(s.analyticsSummary?.latencyNote||"Analytics may be delayed by YouTube.")}</div>`;
  }catch(e){
    try{
      const r=await fetch(apiUrl("/api/youtube/analytics"),{credentials:"include"});
      const s=await r.json();
      if(!r.ok||!s.ok)throw new Error(s.error||e.message);
      const t=s.analytics?.total||{};
      box.innerHTML='<div class="empty">AI learning could not finish: '+esc(e.message)+'. Basic analytics are available: '+Number(t.views||0).toLocaleString()+' views, '+Number(t.likes||0).toLocaleString()+' likes. Try Refresh again later.</div>';
    }catch(fallbackError){
      box.innerHTML='<div class="empty">YouTube learning is not ready: '+esc(fallbackError.message||e.message)+'. Check YouTube connection and Analytics permissions.</div>';
    }
  }
}
async function youtubeStatus(){
  try{
    const r=await fetch(apiUrl("/api/youtube/status"),{credentials:"include"});
    return await r.json();
  }catch(e){return {ok:false,connected:false,error:"Backend is not running"};}
}
function renderAccounts(){
  title.textContent="Platforms";
  view.innerHTML=`<div class="table-card">
    <div class="section-head"><div><h3>Connected Platforms</h3><span class="muted">YouTube uses OAuth; secrets stay server-side.</span></div></div>
    <div class="platform"><div><div class="platform-name">YouTube</div><small id="ytStatusText">Checking connection…</small></div><div class="platform-actions"><span id="ytBadge" class="badge">Checking</span><button class="small-btn" onclick="connectYouTube()">Connect</button></div></div>
    <div class="platform"><div><div class="platform-name">Automation</div><small>Master control for scheduled AI workers and video uploads.</small></div><span class="badge ${data.settings.automationOnline!==false?"ready":""}">${data.settings.automationOnline!==false?"ONLINE":"OFFLINE"}</span></div>
    <div class="platform"><div><div class="platform-name">Facebook</div><small id="fbStatusText">Meta Page publishing</small></div><div class="platform-actions"><span id="fbBadge" class="badge">Checking</span><button class="small-btn" onclick="connectMeta()">Connect Meta</button></div></div>
    <div class="platform"><div><div class="platform-name">Instagram</div><small id="igStatusText">Instagram Professional/Reels publishing</small></div><div class="platform-actions"><span id="igBadge" class="badge">Checking</span><button class="small-btn" onclick="connectMeta()">Connect Meta</button></div></div>
    <div class="table-card" style="margin-top:14px">
      <div class="section-head"><div><h3>YouTube Private Test Upload</h3><span class="muted">Connect Google once, then test a video upload without making it public.</span></div></div>
      <label>Test video title<input id="ytTestTitle" value="AI Content Factory — Private Upload Test"></label>
      <label style="margin-top:10px">Choose video<input id="ytTestFile" type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv,.mpeg,.mpg,.3gp,.wmv,.flv"></label>
      <button class="primary full" style="margin-top:12px" onclick="uploadYouTubeTest()">📤 Upload as Private</button>
      <div id="ytUploadResult" class="muted" style="margin-top:10px">First connect YouTube above.</div>
    </div>
  </div>`;
  youtubeStatus().then(s=>{
    const badge=document.getElementById("ytBadge"), textEl=document.getElementById("ytStatusText");
    if(!badge||!textEl)return;
    if(s.connected){badge.textContent="Connected";badge.className="badge ready";textEl.innerHTML=`<strong>Authorized YouTube channel:</strong> ${esc(s.channel?.title||"Unknown channel")}<br><small>Channel ID: ${esc(s.channel?.id||"Unavailable")}</small>`;}
    else {badge.textContent="Not connected";textEl.textContent=s.error||"Connect your YouTube channel";}
  });
}
function connectYouTube(){
  // Never reuse a stale backend URL saved by an older deployment.
  try{localStorage.removeItem("acf_backend_url");}catch{}
  const target=API_BASE+"/auth/youtube";
  window.location.assign(target);
}
function connectMeta(){window.location.assign(API_BASE+"/auth/meta");}
async function metaStatus(){try{const r=await fetch(apiUrl("/api/meta/status"),{credentials:"include",cache:"no-store"});return await r.json();}catch(e){return {ok:false,error:"Backend unavailable: "+e.message};}}
async function uploadYouTubeTest(){
  const file=document.getElementById("ytTestFile")?.files?.[0];
  const titleInput=document.getElementById("ytTestTitle");
  const result=document.getElementById("ytUploadResult");
  if(!file){result.textContent="Choose a video file first.";return;}
  const isLikelyVideo=file.type.startsWith("video/")||/\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|3gp|wmv|flv)$/i.test(file.name)||!file.type;
  if(!isLikelyVideo){result.textContent="Please choose a video file.";return;}
  result.textContent="Uploading to YouTube as PRIVATE…";
  try{
    const params=new URLSearchParams({
      title:(titleInput?.value||"AI Content Factory — Private Upload Test").trim(),
      privacyStatus:"private"
    });
    const r=await fetch(apiUrl("/api/youtube/upload-file?"+params.toString()),{
      method:"POST",
      headers:{"Content-Type":file.type||"video/mp4"},
      credentials:"include",
      body:file
    });
    const body=await r.json();
    if(!r.ok||!body.ok)throw new Error(body.error||"YouTube upload failed");
    result.innerHTML='Uploaded successfully: <a href="'+esc(body.url)+'" target="_blank" rel="noopener">Open private YouTube video</a>';
  }catch(e){result.textContent="Upload failed: "+e.message;}
}

async function renderAI(){
  title.textContent="AI Studio";
  view.innerHTML=`
  <div class="two-col">
    <div class="table-card">
      <div class="section-head"><div><h3>ChatGPT Content Brain</h3><span class="muted">Generate script, titles, thumbnail brief and YouTube metadata.</span></div><span id="aiBadge" class="badge">Checking</span></div>
      <label>Topic / Idea<input id="aiTopic" placeholder="e.g. Promote my new Bodo song"></label>
      <div class="form-grid">
        <label>Task<select id="aiTask">
          <option value="script">Full Script</option>
          <option value="titles">YouTube Titles</option>
          <option value="thumbnail">Thumbnail Brief</option>
          <option value="description">Description + SEO</option>
          <option value="short_caption">Short Caption</option>
        </select></label>
        <label>Language<select id="aiLanguage"><option>English</option><option>Hindi</option><option>Bodo</option><option>Assamese</option><option>Hindi + Bodo</option></select></label>
      </div>
      <div class="form-grid">
        <label>Category<select id="aiCategory">${data.categories.map(c=>`<option>${esc(c.name)}</option>`).join("")}</select></label>
        <label>Format<select id="aiFormat"><option>Long Video</option><option>Short Video</option><option>Reel</option><option>Promo</option></select></label>
      </div>
      <label>Extra Notes<textarea id="aiNotes" rows="4" placeholder="Audience, CTA, facts, music details, style..."></textarea></label>
      <button class="primary full" onclick="generateAI()">✦ Generate with ChatGPT</button>
    </div>
    <div class="table-card">
      <div class="section-head"><div><h3>Generated Result</h3><span class="muted">Review before adding it to production.</span></div><button class="small-btn" onclick="copyAIResult()">Copy</button></div>
      <pre id="aiResult" class="ai-result">Your generated content will appear here.</pre>
      <button class="small-btn full" onclick="useAIResult()">Add result to notes</button>
    </div>
  </div>`;
  try{
    const r=await fetch(apiUrl("/api/ai/status"));
    const s=await r.json();
    const b=document.getElementById("aiBadge");
    if(s.configured){b.textContent="ChatGPT Ready";b.className="badge ready";}
    else {b.textContent="API key needed";b.className="badge"; }
  }catch(e){}
}
async function generateAI(){
  const result=document.getElementById("aiResult");
  result.textContent="Generating…";
  try{
    const r=await fetch(apiUrl("/api/ai/generate"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      task:document.getElementById("aiTask").value,
      topic:document.getElementById("aiTopic").value.trim(),
      category:document.getElementById("aiCategory").value,
      language:document.getElementById("aiLanguage").value,
      format:document.getElementById("aiFormat").value,
      notes:document.getElementById("aiNotes").value
    })});
    const s=await r.json();
    if(!s.ok) throw new Error(s.error||"Generation failed");
    result.textContent=s.output;
  }catch(e){result.textContent="Error: "+e.message;}
}
async function copyAIResult(){
  const t=document.getElementById("aiResult")?.textContent||"";
  try{await navigator.clipboard.writeText(t);}catch(e){}
}
function useAIResult(){
  const t=document.getElementById("aiResult")?.textContent||"";
  if(!t||t.startsWith("Your generated")||t.startsWith("Error:"))return;
  openModal();
  const notes=document.querySelector('#contentForm textarea[name="notes"]');
  if(notes)notes.value=t;
}

async function renderVoice(){
  title.textContent="Voice Studio";
  view.innerHTML=`
  <div class="two-col">
    <div class="table-card">
      <div class="section-head"><div><h3>ElevenLabs Voice</h3><span class="muted">Generate narration audio for the production pipeline.</span></div><span id="voiceBadge" class="badge">Checking</span></div>
      <label>Voice<select id="voiceId"><option value="">Loading voices…</option></select></label>
      <label>Script / Text<textarea id="voiceText" rows="10" placeholder="Paste the narration or script here…"></textarea></label>
      <div class="form-grid">
        <label>Model<select id="voiceModel"><option value="eleven_multilingual_v2">Multilingual v2</option><option value="eleven_v3">Eleven v3</option><option value="eleven_flash_v2_5">Flash v2.5</option></select></label>
        <label>Language<select id="voiceLanguage"><option value="">Auto</option><option value="en">English</option><option value="hi">Hindi</option><option value="as">Assamese</option><option value="bn">Bengali</option></select></label>
      </div>
      <div class="form-grid">
        <label>Stability<input id="voiceStability" type="number" min="0" max="1" step="0.05" value="0.5"></label>
        <label>Similarity<input id="voiceSimilarity" type="number" min="0" max="1" step="0.05" value="0.75"></label>
      </div>
      <button class="primary full" onclick="generateVoice()">🎙️ Generate Voice</button>
    </div>
    <div class="table-card">
      <div class="section-head"><div><h3>Audio Preview</h3><span class="muted">Preview the generated narration before sending it to the editor.</span></div></div>
      <audio id="voiceAudio" controls style="width:100%;margin:12px 0"></audio>
      <a id="voiceDownload" class="small-btn full" style="display:none;text-align:center;text-decoration:none" download="acf-voice.mp3">Download MP3</a>
      <pre id="voiceResult" class="ai-result">No voice generated yet.</pre>
    </div>
  </div>`;
  try{
    const s=await (await fetch(apiUrl("/api/voice/status"))).json();
    const b=document.getElementById("voiceBadge");
    if(s.configured){b.textContent="ElevenLabs Ready";b.className="badge ready";}
    else {b.textContent="API key needed";b.className="badge";}
    const select=document.getElementById("voiceId");
    const vr=await (await fetch(apiUrl("/api/voice/voices"))).json();
    if(vr.ok&&vr.voices?.length){
      select.innerHTML=vr.voices.map(v=>`<option value="${esc(v.voice_id)}" ${v.voice_id===s.voiceId?"selected":""}>${esc(v.name)} · ${esc(v.category||"voice")}</option>`).join("");
    }else if(s.voiceId){select.innerHTML=`<option value="${esc(s.voiceId)}">${esc(s.voiceId)}</option>`;}
    else select.innerHTML="<option value=''>No voices available</option>";
    if(s.model)document.getElementById("voiceModel").value=s.model;
  }catch(e){document.getElementById("voiceBadge").textContent="Backend unavailable";}
}
async function generateVoice(){
  const out=document.getElementById("voiceResult"), audio=document.getElementById("voiceAudio"), dl=document.getElementById("voiceDownload");
  out.textContent="Generating voice…"; dl.style.display="none"; audio.removeAttribute("src"); audio.load();
  try{
    const r=await fetch(apiUrl("/api/voice/generate"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      text:document.getElementById("voiceText").value,
      voiceId:document.getElementById("voiceId").value,
      modelId:document.getElementById("voiceModel").value,
      languageCode:document.getElementById("voiceLanguage").value||undefined,
      stability:document.getElementById("voiceStability").value,
      similarityBoost:document.getElementById("voiceSimilarity").value
    })});
    if(!r.ok){let e={};try{e=await r.json();}catch{}throw new Error(e.error||"Voice generation failed");}
    const blob=await r.blob(), url=URL.createObjectURL(blob);
    audio.src=url; audio.load(); dl.href=url; dl.style.display="block"; out.textContent="Voice generated successfully.";
  }catch(e){out.textContent="Error: "+e.message;}
}

function renderSettings(){
  title.textContent="Settings";
  view.innerHTML=`<div class="settings-card"><div class="section-head"><div><h3>Automation Controls</h3><span class="muted">One master Online / Offline control. When Online, the AI factory can generate and upload scheduled videos. When Offline, content automation and video uploads stop.</span></div></div><div class="settings-list">${setting("automationOnline","Automation Online","ON = AI workers can run and upload scheduled videos. OFF = workers stay idle and no video upload/publishing runs.",true)}</div></div><div class="settings-card" style="margin-top:16px"><div class="section-head"><div><h3>🛡️ AI Self-Heal</h3><span class="muted">ChatGPT + Google Gemini diagnose runtime failures; the server uses bounded retry/fallback instead of blindly changing code.</span></div><span id="selfHealBadge" class="badge">Checking…</span></div><div id="selfHealInfo" class="queue-meta">Checking reliability layer…</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="small-btn" onclick="checkSelfHeal()">↻ Scan Now</button><button class="small-btn" onclick="fixSelfHealNow()">🛠️ FIX NOW — ChatGPT + Gemini</button></div><pre id="selfHealResult" class="ai-result" style="margin-top:12px">No incident test run yet.</pre></div>`;
}
async function checkSelfHeal(){
  const badge=document.getElementById("selfHealBadge"),info=document.getElementById("selfHealInfo"),out=document.getElementById("selfHealResult");
  if(!badge||!info)return;
  try{
    const r=await fetch(apiUrl("/api/self-heal/status"),{credentials:"include"});
    const data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.error||"Self-heal status unavailable");
    badge.textContent=data.healthy?"System Healthy":"Issue Detected";
    badge.className="badge "+(data.healthy?"ready":"");
    info.innerHTML=(data.health||[]).map(x=>"• <b>"+esc(x.name)+"</b>: "+(x.ok?"OK":"ERROR")+" — "+esc(x.detail)).join("<br>");
    if(out&&data.recentIncidents?.length)out.textContent=data.recentIncidents.map(x=>"["+x.at+"] "+x.operation+" — "+x.message).join("\n");
  }catch(e){badge.textContent="Unavailable";badge.className="badge";info.textContent=e.message;}
}
async function fixSelfHealNow(){
  const badge=document.getElementById("selfHealBadge"),info=document.getElementById("selfHealInfo"),out=document.getElementById("selfHealResult");
  if(out)out.textContent="🔎 ChatGPT + Gemini are checking the issue together and preparing a safe repair…";
  try{
    const r=await fetch(apiUrl("/api/self-heal/fix-now"),{method:"POST",credentials:"include"});
    const data=await r.json();
    if(!r.ok||!data.ok)throw new Error(data.error||"Fix Now failed");
    if(badge){badge.textContent=data.healed?"Fixed / Healthy":"Repair queued";badge.className="badge "+(data.healed?"ready":"");}
    if(info)info.innerHTML=(data.health||[]).map(x=>"• <b>"+esc(x.name)+"</b>: "+(x.ok?"OK":"ERROR")+" — "+esc(x.detail)).join("<br>");
    if(out)out.textContent="CHATGPT:\n"+(data.diagnosis?.chatgpt||"Unavailable")+"\n\nGEMINI:\n"+(data.diagnosis?.gemini||"Unavailable")+"\n\nSAFE ACTIONS:\n"+(data.actions||[]).map(x=>"• "+x.action+": "+x.result).join("\n")+"\n\n"+(data.notice||"");
  }catch(e){if(out)out.textContent="Fix Now error: "+e.message;}
}

async function testSelfHeal(){
  const out=document.getElementById("selfHealResult");
  if(out)out.textContent="Asking ChatGPT + Gemini to diagnose a controlled test incident…";
  try{
    const r=await fetch(apiUrl("/api/self-heal/test"),{method:"POST",credentials:"include"});
    const s=await r.json();
    if(!r.ok||!s.ok)throw new Error(s.error||"Self-heal test failed");
    if(out)out.textContent="Incident "+s.incident.id+"\n\nChatGPT:\n"+(s.diagnosis?.chatgpt||"Unavailable")+"\n\nGemini:\n"+(s.diagnosis?.gemini||"Unavailable");
  }catch(e){if(out)out.textContent="Self-heal test error: "+e.message;}
}
function setting(key,label,desc,defaultOn=false){const on=data.settings[key]??defaultOn;return `<div class="setting"><div><strong>${label}</strong><small>${desc}</small></div><button aria-label="${label}" class="switch premium-switch ${on?"on":""}" onclick="toggleAutomationOnline()" title="${on?"Automation Online":"Automation Offline"}"><i></i></button><span class="automation-state ${on?"online":"offline"}">${on?"ONLINE":"OFFLINE"}</span></div>`;}
async function loadServerSettings(){
  try{
    const r=await fetch(apiUrl("/api/factory/settings"),{credentials:"include"});
    const s=await r.json();
    if(s.ok&&s.settings){
      data.settings={...data.settings,...s.settings};
      if(s.settings.enabledCategories&&typeof s.settings.enabledCategories==="object"){
        for(const c of data.categories){
          if(Object.prototype.hasOwnProperty.call(s.settings.enabledCategories,c.id)){
            c.enabled=s.settings.enabledCategories[c.id]!==false;
          }
        }
      }
      save();
    }
  }catch(e){}
}
function setView(v){document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));if(v==="music-library"&&typeof window.renderMusicLibrary==="function"){window.renderMusicLibrary();return;}({dashboard:renderDashboard,content:renderContent,ai:renderAI,voice:renderVoice,robots:renderRobots,boss:renderBossRoom,"video-generator":renderVideoGenerator,categories:renderCategories,schedule:renderSchedule,accounts:renderAccounts,settings:renderSettings}[v]||renderDashboard)();}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
function openModal(){document.getElementById("categorySelect").innerHTML=data.categories.filter(c=>c.enabled).map(c=>`<option>${esc(c.name)}</option>`).join("");document.getElementById("contentModal").classList.remove("hidden");}
function closeModal(){document.getElementById("contentModal").classList.add("hidden")}
document.getElementById("newContentBtn").onclick=openModal;
document.getElementById("closeModal").onclick=closeModal;
document.getElementById("contentModal").addEventListener("click",e=>{if(e.target.id==="contentModal")closeModal()});
document.getElementById("contentForm").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);data.content.push({id:Date.now(),title:f.get("title"),category:f.get("category"),format:f.get("format"),language:f.get("language"),status:f.get("status"),notes:f.get("notes")});save();e.target.reset();closeModal();setView("content")});
async function toggleCategory(id){
  const c=data.categories.find(x=>x.id===id);
  if(!c)return;
  const previous=c.enabled;
  const desired=!previous;
  c.enabled=desired;
  save();
  renderCategories();
  try{
    const enabledCategories=Object.fromEntries(data.categories.map(x=>[x.id,!!x.enabled]));
    const r=await fetch(apiUrl("/api/factory/settings"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      credentials:"include",
      cache:"no-store",
      body:JSON.stringify({enabledCategories,version:2})
    });
    const s=await r.json().catch(()=>({}));
    if(!r.ok||!s.ok)throw new Error(s.error||"Category setting save failed");
    if(s.source!=="persistent-supabase")throw new Error("Server ne setting permanent storage mein save nahi ki. Vercel par SUPABASE_SERVICE_ROLE_KEY aur Supabase content_jobs table check karein.");
    const saved=s.settings?.enabledCategories;
    if(!saved||saved[id]!==desired)throw new Error("Server ne category ka requested status confirm nahi kiya.");
    for(const item of data.categories){
      if(Object.prototype.hasOwnProperty.call(saved,item.id))item.enabled=saved[item.id]!==false;
    }
    save();
    renderCategories();
  }catch(e){
    c.enabled=previous;
    save();
    renderCategories();
    alert("Category setting permanent save nahi hui: "+e.message);
  }
}
async function toggleAutomationOnline(){
  const previous=data.settings.automationOnline!==false;
  data.settings.automationOnline=!previous;
  data.settings.autoGenerate=true;
  data.settings.approval=false;
  data.settings.autoPublish=true;
  save();
  const activeView=document.querySelector('.nav-item.active')?.dataset.view;
  if(activeView==="accounts") renderAccounts(); else renderSettings();
  try{
    const r=await fetch(apiUrl("/api/factory/settings"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({...data.settings,version:2})});
    const raw=await r.text(); let s=null; try{s=raw?JSON.parse(raw):null;}catch(_){throw new Error(`Server returned HTTP ${r.status} instead of JSON`);}
    if(!r.ok||!s?.ok){
      if(r.status===404){
        const params=new URLSearchParams({save:"1",version:"2",automationOnline:String(!!data.settings.automationOnline)});
        const fallback=await fetch(apiUrl("/api/factory/settings?")+params.toString(),{credentials:"include",cache:"no-store"});
        const fallbackRaw=await fallback.text(); let fs=null; try{fs=fallbackRaw?JSON.parse(fallbackRaw):null;}catch(_){ }
        if(fallback.ok&&fs?.ok){data.settings={...data.settings,...fs.settings};save();if(activeView==="accounts")renderAccounts();else renderSettings();return;}
        throw new Error(`Settings save endpoint returned HTTP ${r.status}; fallback returned HTTP ${fallback.status}`);
      }
      throw new Error(s?.error||`Settings save failed (HTTP ${r.status})`);
    }
    data.settings={...data.settings,...s.settings}; save();
    if(activeView==="accounts") renderAccounts(); else renderSettings();
  }catch(e){
    data.settings.automationOnline=previous; data.settings.autoGenerate=true; data.settings.approval=false; data.settings.autoPublish=true; save();
    if(activeView==="accounts") renderAccounts(); else renderSettings();
    alert("Automation control save failed: "+e.message);
  }
}
document.getElementById("themeBtn").onclick=()=>document.body.classList.toggle("light");
loadServerSettings().finally(()=>{setView("dashboard");setTimeout(loadCreatorLearning,500);});
window.setBackendUrl=function(url){const v=String(url||"").trim().replace(/\/+$/,"");if(v){localStorage.setItem("acf_backend_url",v);}else{localStorage.removeItem("acf_backend_url");}location.reload();};
setTimeout(syncReadyContent,800);
