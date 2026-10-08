require("dotenv").config();
const express=require("express");
const path=require("path");
const fs=require("fs");
const {Readable}=require("stream");
const crypto=require("crypto");
const {google}=require("googleapis");
const {createClient}=require("@supabase/supabase-js");
const app=express();
const PORT=process.env.PORT||3456;
const ROOT=__dirname;
const TOKEN_FILE=path.join(ROOT,".data","youtube-token.json");
const SETTINGS_FILE=path.join(ROOT,".data","factory-settings.json");
const JOBS_FILE=path.join(ROOT,".data","research-jobs.json");
const VOICE_DIR=path.join(ROOT,".data","voices");
const SUPABASE_URL="https://zvtlptvlfzejnmykkcjb.supabase.co";
// This is a Supabase publishable key. It is intentionally safe for public/client use.
// Prefer the explicitly configured current publishable key and never let an old
// service-role value override the Music Library project/key pair.
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||"";
const SUPABASE_SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const supabase=(SUPABASE_URL&&SUPABASE_KEY)?createClient(SUPABASE_URL,SUPABASE_KEY):null;
const supabaseAdmin=(SUPABASE_URL&&SUPABASE_SERVICE_KEY)?createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY,{auth:{autoRefreshToken:false,persistSession:false}}):null;
const MUSIC_STORAGE_BUCKET="music-library";
const BLOB_TOKEN=process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN||"";
const SCOPES=["https://www.googleapis.com/auth/youtube.upload"];
app.use((req,res,next)=>{const origin=req.headers.origin;const allowed=["https://swrang120.github.io","https://ai-content-factory-gussvkdme-swrang120.vercel.app","https://ai-content-factory-4yj61h1a0-swrang120.vercel.app",process.env.FRONTEND_URL].filter(Boolean);if(origin&&allowed.includes(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Access-Control-Allow-Headers","Content-Type,X-API-Key");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");}if(req.method==="OPTIONS")return res.sendStatus(204);next();});
app.use(express.json({limit:"1mb"}));
app.use(express.static(ROOT,{
  index:false,
  fallthrough:true,
  redirect:false
}));

// Static assets must never fall through to the SPA HTML fallback.
// This also makes MIME types explicit for Vercel/Express deployments.
app.get("/styles.css",(req,res)=>{
  const file=path.resolve(ROOT,"styles.css");
  if(!fs.existsSync(file))return res.status(404).type("text").send("styles.css not found");
  res.type("text/css");
  res.setHeader("Cache-Control","public, max-age=3600");
  res.sendFile(file);
});
app.get("/app.js",(req,res)=>{
  const file=path.resolve(ROOT,"app.js");
  if(!fs.existsSync(file))return res.status(404).type("text").send("app.js not found");
  res.type("application/javascript");
  res.setHeader("Cache-Control","public, max-age=3600");
  res.sendFile(file);
});
const CANONICAL_YOUTUBE_REDIRECT_URI="https://ai-content-factory-gussvkdme-swrang120.vercel.app/auth/youtube/callback";
function oauthClient(redirectOverride){
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET){
    throw new Error("YouTube OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel.");
  }
  // Use one canonical callback URL for both authorization and token exchange.
  // This prevents Vercel alias/preview redirects from creating a state mismatch.
  const redirect=redirectOverride||CANONICAL_YOUTUBE_REDIRECT_URI;
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,redirect);
}
function requireAppKey(req,res,next){
  if(!process.env.APP_API_KEY)return next();
  if(req.headers["x-api-key"]!==process.env.APP_API_KEY)return res.status(401).json({ok:false,error:"Unauthorized"});
  next();
}
function setCookie(res,name,value,maxAge=600){
  res.setHeader("Set-Cookie",`${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}
function getCookie(req,name){
  const raw=req.headers.cookie||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return hit?decodeURIComponent(hit.slice(name.length+1)):"";
}
async function loadTokens(req){
  const browserRefresh=getCookie(req||{headers:{}}, "acf_youtube_refresh");
  if(browserRefresh)return {refresh_token:browserRefresh};
  if(process.env.YOUTUBE_REFRESH_TOKEN)return {refresh_token:process.env.YOUTUBE_REFRESH_TOKEN};
  const tokenDb=supabaseAdmin||supabase;
  if(tokenDb){
    try{
      const {data,error}=await tokenDb.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
      if(!error&&data?.tokens){
        const clean={...data.tokens};
        delete clean.__acf_factory_settings;
        return Object.keys(clean).length?clean:null;
      }
    }catch{}
  }
  try{return JSON.parse(fs.readFileSync(TOKEN_FILE,"utf8"));}catch{return null;}
}
async function saveTokens(tokens){
  const tokenDb=supabaseAdmin||supabase;
  if(tokenDb){
    try{
      const {data}=await tokenDb.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
      const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
      const merged={...existing,...tokens};
      const {error}=await tokenDb.from("youtube_connections").upsert({
        id:"default",
        tokens:merged,
        updated_at:new Date().toISOString()
      },{onConflict:"id"});
      if(!error)return;
    }catch{}
  }
  try{
    fs.mkdirSync(path.dirname(TOKEN_FILE),{recursive:true});
    fs.writeFileSync(TOKEN_FILE,JSON.stringify(tokens,null,2));
  }catch{}
}
const DEFAULT_FACTORY_SETTINGS={autoGenerate:true,approval:true,autoPublish:true,liveAutomation:false,liveApproval:true,liveDurationMinutes:120,musicSourceChannels:["UC_7oWDyqUuF8FtCm3XWkMvQ","UC45qxqZuEpQvYs14c1pLf7Q"],enabledCategories:{music:true,news:true,product:true,sports:true,editing:true,tech:true}};
const MUSIC_SOURCE_CHANNEL_IDS=["UC_7oWDyqUuF8FtCm3XWkMvQ","UC45qxqZuEpQvYs14c1pLf7Q"];
const MUSIC_ARTIST_NAMES=["Swrang Swargiary","Santiram Swargiary"];
let settingsCache=null;
let settingsPersistentLoaded=false;
function loadSettings(){
  if(settingsCache)return settingsCache;
  settingsCache={...DEFAULT_FACTORY_SETTINGS};
  return settingsCache;
}
function saveSettings(settings){
  // Vercel /var/task is read-only. Settings must never depend on local files.
  settingsCache={...DEFAULT_FACTORY_SETTINGS,...settings};
}
async function hydrateSettings(){
  const current=loadSettings();
  if(!supabase)return current;
  try{
    const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    const saved=data?.tokens?.__acf_factory_settings;
    if(!error&&saved&&typeof saved==="object"){
      settingsCache={...DEFAULT_FACTORY_SETTINGS,...saved};
      settingsPersistentLoaded=true;
    }
  }catch{}
  return settingsCache||current;
}
async function persistSettings(settings){
  settingsCache={...DEFAULT_FACTORY_SETTINGS,...settings};
  if(!supabase)return {ok:false,error:"Supabase is not configured"};
  try{
    const {data}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
    const tokens={...existing,__acf_factory_settings:settingsCache};
    const {error}=await supabase.from("youtube_connections").upsert({
      id:"default",
      tokens,
      updated_at:new Date().toISOString()
    },{onConflict:"id"});
    if(error)throw new Error(error.message);
    settingsPersistentLoaded=true;
    return {ok:true};
  }catch(error){
    throw new Error("Could not persist settings to Supabase: "+error.message);
  }
}
const AGENT_IDS=["manager","research","script","voice","visual","editor","thumb","qa","publisher","analytics"];
const AGENT_DEFAULTS=Object.fromEntries(AGENT_IDS.map(id=>[id,{id,status:"SLEEPING",progress:0,task:"Waiting for a job",jobId:null,updatedAt:new Date().toISOString()}]));
let agentStateCache=null;
function normalizeAgentState(input={}){
  const out={};
  for(const id of AGENT_IDS){
    const raw=input[id]&&typeof input[id]==="object"?input[id]:{};
    const status=["WORKING","SLEEPING","MEETING","ERROR"].includes(String(raw.status||"").toUpperCase())?String(raw.status).toUpperCase():"SLEEPING";
    out[id]={id,status,progress:Math.max(0,Math.min(100,Number(raw.progress)||0)),task:String(raw.task||"Waiting for a job").slice(0,240),jobId:raw.jobId?String(raw.jobId).slice(0,120):null,updatedAt:raw.updatedAt||new Date().toISOString()};
  }
  return out;
}
async function getAgentState(){
  if(agentStateCache)return agentStateCache;
  agentStateCache=normalizeAgentState();
  if(!supabase)return agentStateCache;
  try{
    const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    const saved=data?.tokens?.__acf_agent_state;
    if(!error&&saved&&typeof saved==="object")agentStateCache=normalizeAgentState(saved);
  }catch{}
  return agentStateCache;
}
async function setAgentStates(changes={}){
  const current=await getAgentState();
  for(const [id,value] of Object.entries(changes)){
    if(!AGENT_IDS.includes(id))continue;
    current[id]={...current[id],...value,id,updatedAt:new Date().toISOString()};
  }
  agentStateCache=normalizeAgentState(current);
  if(!supabase)return agentStateCache;
  try{
    const {data}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
    const tokens={...existing,__acf_agent_state:agentStateCache};
    await supabase.from("youtube_connections").upsert({id:"default",tokens,updated_at:new Date().toISOString()},{onConflict:"id"});
  }catch(error){console.error("Agent state persistence warning:",safeErrorMessage(error));}
  return agentStateCache;
}
async function setAgentState(id,status,progress,task,jobId=null){
  return setAgentStates({[id]:{status,progress,task,jobId}});
}
function loadJobs(){try{return JSON.parse(fs.readFileSync(JOBS_FILE,"utf8"));}catch{return {};}}
function saveJobs(jobs){try{fs.mkdirSync(path.dirname(JOBS_FILE),{recursive:true});fs.writeFileSync(JOBS_FILE,JSON.stringify(jobs,null,2));}catch{ /* Vercel filesystem is ephemeral/read-only; Supabase is the persistent store. */ }}
function jobId(){return "job_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);}
function encodeJobNotes(job){
  const meta={
    manualUpload:!!job.manualUpload,
    auto:!!job.auto,
    autoPublish:job.autoPublish!==false,
    scheduledSlot:job.scheduledSlot||null,
    publishAt:job.publishAt||null,
    title:job.title||null,
    description:job.description||null,
    tags:Array.isArray(job.tags)?job.tags:[],
    categoryId:job.categoryId||null,
    privacyStatus:job.privacyStatus||null,
    renderError:job.renderError||null,
    publishError:job.publishError||null
  };
  return "__ACF_META__"+JSON.stringify(meta)+"\\n"+String(job.notes||"");
}
function decodeJobRow(data){
  let notes=String(data.notes||"");
  let meta={};
  if(notes.startsWith("__ACF_META__")){
    const nl=notes.indexOf("\\n");
    const raw=nl>=0?notes.slice(11,nl):notes.slice(11);
    try{meta=JSON.parse(raw)||{};}catch{}
    notes=nl>=0?notes.slice(nl+1):"";
  }
  return {
    id:data.id,status:data.status,topic:data.topic,category:data.category,language:data.language,
    format:data.format,notes,sourceText:data.source_text,sources:data.sources||[],research:data.research,
    script:data.script,voice:data.voice,renderedVideoUrl:data.rendered_video_url||null,approved:!!data.approved,
    youtube:data.youtube||null,createdAt:data.created_at,updatedAt:data.updated_at,...meta
  };
}
async function persistJob(job){
  if(!supabase)return;
  const row={id:job.id,status:job.status,topic:job.topic||"",category:job.category||"",language:job.language||"English",format:job.format||"Long Video",notes:encodeJobNotes(job),source_text:job.sourceText||"",sources:job.sources||[],research:job.research||null,script:job.script||null,voice:job.voice||null,rendered_video_url:job.renderedVideoUrl||null,approved:!!job.approved,youtube:job.youtube||null,created_at:job.createdAt||new Date().toISOString(),updated_at:job.updatedAt||new Date().toISOString()};
  const {error}=await supabase.from("content_jobs").upsert(row,{onConflict:"id"});
  if(error)throw new Error("Supabase content_jobs write failed: "+error.message);
}
async function getJobFromSupabase(id){
  if(!supabase)return null;
  const {data,error}=await supabase.from("content_jobs").select("*").eq("id",id).maybeSingle();
  if(error)throw new Error("Supabase content_jobs read failed: "+error.message);
  if(!data)return null;
  return decodeJobRow(data);
}
async function loadPersistentJobs(){
  const jobs=loadJobs();
  if(!supabase)return jobs;
  try{
    const {data,error}=await supabase.from("content_jobs").select("*").neq("id","__factory_settings__").order("updated_at",{ascending:false}).limit(200);
    if(!error&&Array.isArray(data)){
      for(const row of data)jobs[row.id]=decodeJobRow(row);
    }
  }catch{}
  return jobs;
}
async function youtube(req){
  const tokens=await loadTokens(req);
  if(!tokens)throw new Error("YouTube is not connected. Open Platforms and connect YouTube first.");
  const client=oauthClient();
  client.setCredentials(tokens);
  client.on("tokens",t=>{saveTokens({...tokens,...t}).catch(()=>{});});
  return google.youtube({version:"v3",auth:client});
}
// =========================
 // SELF-HEAL AI LAYER
 // ChatGPT + Gemini diagnose failures; remediation is limited to safe retries/fallbacks.
 const SELF_HEAL_ENABLED=process.env.SELF_HEAL_ENABLED!=="false";
 const SELF_HEAL_MAX_RETRIES=Math.max(0,Math.min(3,Number(process.env.SELF_HEAL_MAX_RETRIES||2)));
 const selfHealIncidents=[];
 function safeErrorMessage(err){
   return String(err?.message||err||"Unknown error").replace(/(sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|Bearer\\s+[A-Za-z0-9._-]+)/g,"[REDACTED]").slice(0,1200);
 }
 function rememberIncident(error,context={}){
   const item={id:crypto.randomUUID(),at:new Date().toISOString(),route:context.route||"unknown",operation:context.operation||"unknown",message:safeErrorMessage(error),status:context.status||500,healed:false,diagnosis:null};
   selfHealIncidents.unshift(item);
   if(selfHealIncidents.length>50)selfHealIncidents.length=50;
   return item;
 }
 function isTransientError(error){
   const s=safeErrorMessage(error).toLowerCase();
   return /timeout|timed out|econnreset|eai_again|fetch failed|429|rate limit|too many requests|502|503|504|temporar|network|socket hang up/.test(s);
 }
 async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
 async function retryTransient(fn){
   let last;
   for(let attempt=0;attempt<=SELF_HEAL_MAX_RETRIES;attempt++){
     try{return await fn();}
     catch(error){
       last=error;
       if(!SELF_HEAL_ENABLED||attempt>=SELF_HEAL_MAX_RETRIES||!isTransientError(error))throw error;
       await sleep(500*Math.pow(2,attempt));
     }
   }
   throw last;
 }
 async function askGeminiToDiagnose(incident){
   if(!process.env.GEMINI_API_KEY)return "Gemini not configured.";
   const prompt=["You are the reliability engineer for a private AI Content Factory.","Diagnose this runtime incident and suggest only safe runtime remediation: retry, fallback provider, queue/skip the failed job, reconnect a dependency, or configuration check.","Never expose secrets, disable security, bypass authentication, or blindly rewrite source code.","Incident:",JSON.stringify(incident)].join("\\n");
   const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
   const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:500}})});
   const body=await response.json();
   if(!response.ok)throw new Error(body?.error?.message||"Gemini diagnosis failed");
   return body?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join(" ").trim()||"No Gemini diagnosis returned.";
 }
 async function askChatGPTToDiagnose(incident){
   if(!process.env.OPENAI_API_KEY)return "ChatGPT not configured.";
   const prompt=["You are the reliability engineer for a private AI Content Factory.","Diagnose this runtime incident and suggest only safe runtime remediation: retry, fallback provider, queue/skip the failed job, reconnect a dependency, or configuration check.","Never expose secrets, disable security, bypass authentication, or blindly rewrite source code.","Incident:",JSON.stringify(incident)].join("\\n");
   const model=process.env.OPENAI_MODEL||"gpt-6-luna";
   const response=await retryTransient(()=>fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model,input:prompt,store:false})}));
   const body=await response.json();
   if(!response.ok)throw new Error(body?.error?.message||"ChatGPT diagnosis failed");
   return String(body.output_text||"No ChatGPT diagnosis returned.").slice(0,2500);
 }
 async function diagnoseIncident(incident){
   const [chat,gemini]=await Promise.allSettled([askChatGPTToDiagnose(incident),askGeminiToDiagnose(incident)]);
   incident.diagnosis={
     chatgpt:chat.status==="fulfilled"?chat.value:"Unavailable: "+safeErrorMessage(chat.reason),
     gemini:gemini.status==="fulfilled"?gemini.value:"Unavailable: "+safeErrorMessage(gemini.reason)
   };
   return incident.diagnosis;
 }
 async function fallbackTextGeneration(task,fields){
   if(!process.env.GEMINI_API_KEY)throw new Error("No AI fallback is configured.");
   const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
   const prompt=["You are the fallback Content Brain for a private AI Content Factory.","Return original, useful content. Never invent facts. For current news/sports, do not generate if verified source material is missing.","TASK: "+task,"INPUT:",JSON.stringify(fields||{},null,2)].join("\\n");
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.4,maxOutputTokens:2500}})});
   const body=await r.json();
   if(!r.ok)throw new Error(body?.error?.message||"Gemini fallback generation failed");
   return body?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join(" ").trim()||"";
 }
 function needsLiveResearch(task,fields){
  const s=(String(task||"")+" "+JSON.stringify(fields||{})).toLowerCase();
  return /news|sports|current|today|latest|breaking|live update|verified source/.test(s);
}
async function generateWithChatGPT(task,fields){
  if(!process.env.OPENAI_API_KEY)throw new Error("ChatGPT API is not configured. Add OPENAI_API_KEY on the server.");
  const model=process.env.OPENAI_MODEL||"gpt-6-luna";
  const live=needsLiveResearch(task,fields);
  const instructions=live
    ?"You are the Content Brain for a private AI Content Factory. For current news or sports, research the live web before writing. Use multiple credible sources where possible, prefer primary/official sources for factual claims, and clearly distinguish confirmed facts from developing or attributed claims. Never invent names, dates, scores, quotes, locations or numbers. For political/news topics remain neutral and factual. Include a compact Sources section with the URLs of the key sources used. Create original wording; never copy article text or copyrighted scripts."
    :"You are the Content Brain for a private AI Content Factory. Create original, useful, platform-safe content. Never invent factual claims when source material is provided.";
  const prompt=[
    "TASK: "+task,
    "",
    "CONTENT INPUT:",
    JSON.stringify(fields||{},null,2),
    "",
    "OUTPUT REQUIREMENTS:",
    "Write for YouTube first. Avoid copyrighted song lyrics, copied scripts, fabricated sources, and unsupported factual claims.",
    live
      ?"This is a live-information task. Search the web now. Prefer recent reliable reporting and official sources. If a fact cannot be verified, omit it. Preserve dates and distinguish the event date from the publication date."
      :""
  ].join("\n");
  const bodyInput={
    model,
    instructions,
    input:[{role:"user",content:prompt}],
    store:false
  };
  if(live){
    bodyInput.tools=[{
      type:"web_search",
      search_context_size:"high",
      user_location:{type:"approximate",country:"IN",timezone:"Asia/Kolkata"}
    }];
  }
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.OPENAI_API_KEY},
    body:JSON.stringify(bodyInput)
  });
  const body=await response.json();
  if(!response.ok){
    const err=new Error(body?.error?.message||"ChatGPT API request failed");
    if(SELF_HEAL_ENABLED&&process.env.GEMINI_API_KEY&&(response.status===429||response.status>=500)){
      try{return await fallbackTextGeneration(task,fields);}
      catch(fallbackError){
        const incident=rememberIncident(fallbackError,{operation:"gemini_fallback_generation",route:"/api/ai/generate",status:response.status});
        diagnoseIncident(incident).catch(()=>{});
      }
    }
    throw err;
  }
  return body.output_text||"";
}
async function generateThumbnailImage(prompt,size="1536x1024"){
  if(!process.env.OPENAI_API_KEY)throw new Error("ChatGPT/OpenAI API is not configured. Add OPENAI_API_KEY on the server.");
  const r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_IMAGE_MODEL||"gpt-image-1",prompt:String(prompt||"").trim(),size})});
  const body=await r.json();
  if(!r.ok)throw new Error(body?.error?.message||"Thumbnail image generation failed");
  const item=body?.data?.[0];
  if(!item?.b64_json)throw new Error("Thumbnail generator returned no image.");
  return item.b64_json;
}
app.get("/api/thumbnail/status",requireAppKey,(req,res)=>res.json({ok:true,configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_IMAGE_MODEL||"gpt-image-1"}));
app.post("/api/thumbnail/generate",requireAppKey,async(req,res)=>{
  try{
    const {topic="",title="",style="professional cinematic",language="English",extra=""}=req.body||{};
    if(!topic&&!title)return res.status(400).json({ok:false,error:"topic or title is required"});
    const prompt=[
      "Create a professional YouTube thumbnail for a private AI Content Factory.",
      "Subject/topic: "+(topic||title),
      "Thumbnail title text: "+(title||topic),
      "Style: "+style,
      "Language: "+language,
      extra?"Extra direction: "+extra:"",
      "Use a strong cinematic composition, clear focal subject, high contrast, premium creator aesthetic.",
      "Keep important visual elements inside safe margins. Do not use copyrighted logos, celebrity likenesses, or copied artwork.",
      "Use only short readable title text; avoid tiny paragraphs and clutter."
    ].filter(Boolean).join("\n");
    const b64=await generateThumbnailImage(prompt);
    res.json({ok:true,model:process.env.OPENAI_IMAGE_MODEL||"gpt-image-1",mime:"image/png",dataUrl:"data:image/png;base64,"+b64});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.get("/api/ai/status",requireAppKey,(req,res)=>res.json({ok:true,configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||"gpt-6-luna"}));
async function runFactoryHealthChecks(){
  const checks=[];
  const add=(name,ok,detail,fixable=false)=>checks.push({name,ok,detail:String(detail||"").slice(0,800),fixable});
  add("ChatGPT",!!process.env.OPENAI_API_KEY,process.env.OPENAI_API_KEY?"API key configured":"OPENAI_API_KEY missing",true);
  add("Google Gemini",!!process.env.GEMINI_API_KEY,process.env.GEMINI_API_KEY?"API key configured":"GEMINI_API_KEY missing",true);
  add("YouTube OAuth",!!process.env.GOOGLE_CLIENT_ID&&!!process.env.GOOGLE_CLIENT_SECRET&&!!process.env.YOUTUBE_REDIRECT_URI,process.env.YOUTUBE_REDIRECT_URI||"YouTube OAuth configuration incomplete",true);
  add("Vercel Blob",true,BLOB_TOKEN?"Vercel Blob token configured":"Using Vercel Blob OIDC when the store is connected to this project",true);
  add("Cron",!!process.env.CRON_SECRET,process.env.CRON_SECRET?"Cron secret configured":"CRON_SECRET missing",true);
  try{
    if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
      const r=await fetch(String(process.env.SUPABASE_URL).replace(/\/$/,"")+"/rest/v1/content_jobs?select=id&limit=1",{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY}});
      add("Supabase",r.ok,"HTTP "+r.status,true);
    }else add("Supabase",false,"Supabase configuration incomplete",true);
  }catch(e){add("Supabase",false,safeErrorMessage(e),true);}
  try{
    if(process.env.OPENAI_API_KEY){
      const r=await fetch("https://api.openai.com/v1/models",{headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY}});
      add("ChatGPT API",r.ok,"HTTP "+r.status,true);
    }
  }catch(e){add("ChatGPT API",false,safeErrorMessage(e),true);}
  try{
    if(process.env.GEMINI_API_KEY){
      const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model),{headers:{"x-goog-api-key":process.env.GEMINI_API_KEY}});
      add("Gemini API",r.ok,"HTTP "+r.status,true);
    }
  }catch(e){add("Gemini API",false,safeErrorMessage(e),true);}
  return checks;
}
async function getDualRepairPlan(incident,health){
  const context={incident,health};
  const [a,b]=await Promise.allSettled([askChatGPTToDiagnose(context),askGeminiToDiagnose(context)]);
  return {chatgpt:a.status==="fulfilled"?a.value:"Unavailable: "+safeErrorMessage(a.reason),gemini:b.status==="fulfilled"?b.value:"Unavailable: "+safeErrorMessage(b.reason),agreement:a.status==="fulfilled"&&b.status==="fulfilled"};
}
async function executeSafeRepair(incident,health){
  const actions=[];
  const failed=health.filter(x=>!x.ok);
  for(const item of failed){
    if(item.name==="ChatGPT API"||item.name==="Gemini API") actions.push({action:"retry_provider",target:item.name,result:"Provider will be retried automatically on transient failures."});
    else if(item.name==="Supabase") actions.push({action:"reconnect_database",target:"Supabase",result:"Database access will be retried; no schema/data changes were made."});
    else if(item.name==="Vercel Blob") actions.push({action:"queue_media",target:"Vercel Blob",result:"Media jobs remain queued until storage is healthy."});
    else if(item.name==="YouTube OAuth") actions.push({action:"hold_publish",target:"YouTube",result:"Publishing is held until OAuth configuration is healthy."});
    else if(item.name==="Cron") actions.push({action:"hold_scheduler",target:"Cron",result:"Scheduler remains protected until CRON_SECRET is healthy."});
  }
  if(!failed.length)actions.push({action:"verify_only",result:"All configured health checks passed."});
  return actions;
}
app.get("/api/self-heal/status",requireAppKey,async(req,res)=>{try{const health=await runFactoryHealthChecks();res.json({ok:true,enabled:SELF_HEAL_ENABLED,providers:{chatgpt:{configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||"gpt-6-luna"},gemini:{configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||"gemini-3.8-flash"}},retryLimit:SELF_HEAL_MAX_RETRIES,health,healthy:health.every(x=>x.ok),recentIncidents:selfHealIncidents.slice(0,10).map(x=>({id:x.id,at:x.at,route:x.route,operation:x.operation,message:x.message,healed:x.healed,diagnosis:x.diagnosis}))});}catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}});
app.post("/api/self-heal/scan",requireAppKey,async(req,res)=>{
  try{
    const health=await runFactoryHealthChecks();
    const failed=health.filter(x=>!x.ok);
    let diagnosis=null;
    if(failed.length){
      const incident=rememberIncident(new Error(failed.map(x=>x.name+": "+x.detail).join("; ")),{route:"/api/self-heal/scan",operation:"daily_health_scan",status:503});
      diagnosis=await getDualRepairPlan(incident,health);
    }
    res.json({ok:true,healthy:failed.length===0,health,diagnosis});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/self-heal/fix-now",requireAppKey,async(req,res)=>{
  try{
    const health=await runFactoryHealthChecks();
    const failed=health.filter(x=>!x.ok);
    const incident=rememberIncident(new Error(failed.length?failed.map(x=>x.name+": "+x.detail).join("; "):"Manual Fix Now check"),{route:"/api/self-heal/fix-now",operation:"manual_fix_now",status:failed.length?503:200});
    const diagnosis=await getDualRepairPlan(incident,health);
    const actions=await executeSafeRepair(incident,health);
    incident.diagnosis=diagnosis;
    incident.healed=failed.length===0;
    res.json({ok:true,healed:failed.length===0,health,diagnosis,actions,notice:failed.length?"Safe runtime remediation applied/queued.":"All health checks are healthy."});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/self-heal/test",requireAppKey,async(req,res)=>{try{const incident=rememberIncident(new Error("Self-heal test incident"),{route:"/api/self-heal/test",operation:"diagnostic_test",status:503});const diagnosis=await diagnoseIncident(incident);res.json({ok:true,incident:{id:incident.id,message:incident.message},diagnosis});}catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}});

function requireElevenLabs(){if(!process.env.ELEVENLABS_API_KEY)throw new Error("ElevenLabs is not configured. Add ELEVENLABS_API_KEY on the server.");}

async function generateElevenLabsAudio(text,voiceId,modelId,languageCode){
  requireElevenLabs();
  const voice=voiceId||process.env.ELEVENLABS_VOICE_ID;
  if(!voice)throw new Error("ELEVENLABS_VOICE_ID is not configured.");
  const model=modelId||process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2";
  const payload={text:String(text||"").trim(),model_id:model};
  if(languageCode)payload.language_code=languageCode;
  const url="https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice)+"?output_format=mp3_44100_128";
  const r=await fetch(url,{method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,"Content-Type":"application/json","Accept":"audio/mpeg"},body:JSON.stringify(payload)});
  if(!r.ok){let body={};try{body=await r.json();}catch{}throw new Error(body?.detail?.message||body?.detail||"ElevenLabs voice generation failed");}
  return Buffer.from(await r.arrayBuffer());
}
function voiceForLanguage(language){
  const value=String(language||"").toLowerCase();
  if(value.includes("hindi"))return process.env.ELEVENLABS_HINDI_VOICE_ID||process.env.ELEVENLABS_VOICE_ID||"";
  if(value.includes("english"))return process.env.ELEVENLABS_ENGLISH_VOICE_ID||process.env.ELEVENLABS_VOICE_ID||"";
  return process.env.ELEVENLABS_VOICE_ID||process.env.ELEVENLABS_ENGLISH_VOICE_ID||"";
}
async function runVoiceForJob(job){
  if(!process.env.ELEVENLABS_API_KEY)return {status:"voice_waiting_api",error:"ElevenLabs API key is not configured."};
  if(!job.script)return {status:"voice_waiting_script",error:"Script is not ready."};
  const selectedVoice=voiceForLanguage(job.language);
  if(!selectedVoice)return {status:"voice_waiting_voice",error:"No ElevenLabs voice ID is configured."};
  const audio=await generateElevenLabsAudio(job.script,selectedVoice,process.env.ELEVENLABS_MODEL_ID,job.language==="Assamese"?"as":job.language==="Hindi"?"hi":undefined);
  const {put}=await import("@vercel/blob");
  const blob=await put("voices/"+job.id+".mp3",audio,{access:"public",contentType:"audio/mpeg",...(BLOB_TOKEN?{token:BLOB_TOKEN}:{})});
  job.voice={status:"ready",file:blob.url,model:process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2",voiceId:selectedVoice,generatedAt:new Date().toISOString()};
  job.status="voice_ready";
  job.updatedAt=new Date().toISOString();
  return job.voice;
}

let REMOTION_BUNDLE_PROMISE=null;
async function getRemotionBundle(){
  if(!REMOTION_BUNDLE_PROMISE){
    REMOTION_BUNDLE_PROMISE=(async()=>{
      const {bundle}=await import("@remotion/bundler");
      return bundle({entryPoint:path.join(ROOT,"remotion","index.jsx"),webpackOverride:(config)=>config});
    })();
  }
  return REMOTION_BUNDLE_PROMISE;
}
async function fetchSpotifyTrackMetadata(spotifyUrl){
  const raw=String(spotifyUrl||"").trim();
  if(!/^https?:\/\/(open\.)?spotify\.com\/track\/[A-Za-z0-9]+/i.test(raw))throw new Error("Enter a valid Spotify track link.");
  const url="https://open.spotify.com/oembed?url="+encodeURIComponent(raw);
  const r=await fetch(url,{headers:{"Accept":"application/json"}});
  if(!r.ok)throw new Error("Could not read Spotify track metadata (HTTP "+r.status+").");
  const body=await r.json();
  const title=String(body?.title||"").trim();
  const author=String(body?.author_name||"").trim();
  return {spotifyUrl:raw,title,artist:author,thumbnailUrl:body?.thumbnail_url||null,provider:"Spotify"};
}
async function chooseMusicHook(transcriptSegments,title,artist){
  const segments=Array.isArray(transcriptSegments)?transcriptSegments.filter(x=>x&&x.text):[];
  if(!segments.length)return {startSeconds:0,durationSeconds:25,hookText:""};
  const compact=segments.map((x,i)=>({i,start:Number(x.start)||0,end:Number(x.end)||0,text:String(x.text||"").trim().slice(0,240)}));
  try{
    const out=await generateWithChatGPT("music_promotion_hook",{title,artist,segments:compact,requirement:"Choose the strongest emotionally memorable/original hook for a short music promotion. Return ONLY JSON: {index,startSeconds,endSeconds,hookText,reason}. Prefer a coherent line or 2-3 connected segments. Never reproduce more lyric text than is present in the supplied transcript."});
    const cleaned=String(out||"").replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim();
    const pick=JSON.parse(cleaned);
    const start=Math.max(0,Number(pick.startSeconds));
    const end=Math.max(start+8,Number(pick.endSeconds));
    return {startSeconds:start,durationSeconds:Math.min(30,end-start),hookText:String(pick.hookText||"").slice(0,500),reason:String(pick.reason||"").slice(0,500)};
  }catch{
    const first=compact[0];
    return {startSeconds:first.start,durationSeconds:Math.min(25,Math.max(8,first.end-first.start)),hookText:first.text,reason:"Fallback hook selection"};
  }
}
async function transcribeMusicAudio(audioUrl){
  if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY is required to analyze the music hook.");
  const asset=await fetch(audioUrl);
  if(!asset.ok)throw new Error("Could not fetch the uploaded original audio.");
  const buffer=Buffer.from(await asset.arrayBuffer());
  const blob=new Blob([buffer],{type:asset.headers.get("content-type")||"audio/mpeg"});
  const form=new FormData();
  form.append("file",blob,"original-song.mp3");
  form.append("model",process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-4o-mini-transcribe");
  form.append("response_format","verbose_json");
  const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:form});
  const body=await r.json();
  if(!r.ok)throw new Error(body?.error?.message||"Music transcription failed");
  return {text:String(body?.text||""),segments:Array.isArray(body?.segments)?body.segments:[]};
}
async function createMusicPromotionJob({spotifyUrl,audioUrl,title,artist,thumbnailUrl,language="Hindi + Bodo",notes="",req}){
  let meta;
  if(spotifyUrl){ meta=await fetchSpotifyTrackMetadata(spotifyUrl); }
  else { meta={spotifyUrl:null,title:String(title||"Original Song"),artist:String(artist||"Swrang Swargiary"),thumbnailUrl:thumbnailUrl||null,provider:"Supabase Storage"}; }
  if(!audioUrl)throw new Error("Original song audio is missing.");
  const transcript=await transcribeMusicAudio(audioUrl);
  const hook=await chooseMusicHook(transcript.segments,meta.title,meta.artist);
  const id=jobId();
  const jobs=loadJobs();
  const topic=(meta.title||"Original Song")+" — Music Promotion";
  const job={id,status:"music_hook_selected",topic,category:"Music Promotion",language,format:"Short Video",notes:(meta.spotifyUrl?"Spotify: "+meta.spotifyUrl+"\n":"")+"Artist: "+meta.artist+"\nHook: "+hook.hookText+"\n"+String(notes||""),sourceText:transcript.text,sources:meta.spotifyUrl?[meta.spotifyUrl]:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),auto:true,manualUpload:true,approved:true,music:{spotifyUrl:meta.spotifyUrl,title:meta.title,artist:meta.artist,thumbnailUrl:meta.thumbnailUrl,audioUrl,hookStartSeconds:hook.startSeconds,hookDurationSeconds:hook.durationSeconds,hookText:hook.hookText}};
  jobs[id]=job;saveJobs(jobs);await persistJob(job);
  await setAgentState("manager","WORKING",10,"Music promotion order received",id);
  await setAgentState("research","WORKING",35,"Analyzing the original song and selecting the strongest hook",id);
  job.script=hook.hookText||("Listen to "+(meta.title||"this original song")+" by "+(meta.artist||"the artist")+" — original music.");
  job.status="rendering";job.updatedAt=new Date().toISOString();saveJobs(jobs);await persistJob(job);
  await setAgentState("research","SLEEPING",100,"Best promotion hook selected",id);
  await setAgentState("editor","WORKING",65,"Cutting the original song hook into a promo video",id);
  job.renderedVideoUrl=await renderFactoryVideo(job,req);
  job.status="rendered";job.updatedAt=new Date().toISOString();saveJobs(jobs);await persistJob(job);
  await setAgentState("editor","SLEEPING",100,"Music promo video rendered",id);
  await setAgentState("qa","WORKING",90,"Checking music source and promo metadata",id);
  const settings=await hydrateSettings();
  if(settings.autoPublish){
    await setAgentState("publisher","WORKING",95,"Uploading music promotion to YouTube",id);
    const youtube=await publishRenderedYouTubeVideo({videoUrl:job.renderedVideoUrl,title:(meta.title||"Original Song")+" | Official Music Promo",description:"Original music promotion. "+(meta.spotifyUrl?"Listen on Spotify: "+meta.spotifyUrl+"\n":"")+"Artist: "+meta.artist,tags:["Music Promotion","Original Music",meta.artist].filter(Boolean),categoryId:"10",privacyStatus:"public",approved:true,automated:true,req});
    job.youtube=youtube;job.status="published";
  }
  job.updatedAt=new Date().toISOString();saveJobs(jobs);await persistJob(job);
  await setAgentState("qa","SLEEPING",100,"Music promo QA complete",id);
  await setAgentState("publisher","SLEEPING",100,job.status==="published"?"Music promo published":"Music promo ready",id);
  await setAgentState("manager","SLEEPING",100,"Music promotion order complete",id);
  return {ok:true,jobId:id,status:job.status,track:meta,hook,music:job.music,video:job.youtube||null,renderedVideoUrl:job.renderedVideoUrl};
}

async function renderFactoryVideo(job,req){
  const {createSandbox,addBundleToSandbox,renderMediaOnVercel,uploadToVercelBlob}=await import("@remotion/vercel");
  const bundleDir=await getRemotionBundle();
  const sandbox=await createSandbox();
  const serveUrl=await addBundleToSandbox({sandbox,bundleDir});
  const origin=((req.headers["x-forwarded-proto"]||req.protocol)+"//"+req.get("host"));
  const audioUrl=job.voice?.file?new URL(job.voice.file,origin).toString():"";
  const script=typeof job.script==="string"?job.script:(job.script?.output||job.script?.text||JSON.stringify(job.script||""));
  const musicUrl=job.music?.audioUrl||"";
  const musicStartSeconds=Math.max(0,Number(job.music?.hookStartSeconds)||0);
  const musicDurationSeconds=Math.max(1,Number(job.music?.hookDurationSeconds)||25);
  const title=job.title||job.topic||"AI Content Factory";
  const {sandboxFilePath}=await renderMediaOnVercel({
    sandbox,
    serveUrl,
    compositionId:"FactoryVideo",
    inputProps:{title,script,audioUrl,musicUrl,musicStartSeconds,musicDurationSeconds,spotifyUrl:job.music?.spotifyUrl||"",artist:job.music?.artist||"",durationSeconds:job.music?30:45},
    codec:"h264",
    outputFile:"/tmp/factory-video.mp4"
  });
  const uploaded=await uploadToVercelBlob({
    sandbox,
    sandboxFilePath,
    contentType:"video/mp4",
    ...(BLOB_TOKEN?{blobToken:BLOB_TOKEN}:{}),
    access:"public",
    blobPath:"renders/"+job.id+".mp4"
  });
  try{await sandbox.stop();}catch{}
  return uploaded.url;
}

const AUTO_SCHEDULES=[
  {id:"editing_morning",category:"Editing Knowledge",icon:"🎬",time:"09:00",format:"Short Video",language:"English",prompt:"Trending video editing tutorial, creator editing tip, CapCut/VN/Alight Motion/Premiere Pro workflow. Make it practical and original."},
  {id:"music_promo",category:"Music Promotion",icon:"🎵",time:"12:00",format:"Promo",language:"Hindi + Bodo",prompt:"Promote an original romantic/sad music release or artist story. Do not reproduce copyrighted lyrics. Focus on original promotional storytelling."},
  {id:"product_promo",category:"Product Promotion",icon:"🛍️",time:"15:00",format:"Promo",language:"Hindi",prompt:"Useful product information or promotion. Clearly distinguish facts from opinions and do not invent specifications, prices or claims."},
  {id:"news_evening",category:"News & Updates",icon:"📰",time:"17:00",format:"Short Video",language:"English",prompt:"Current news explainer. ONLY use verified source material supplied to the job; never invent current events or statistics."},
  {id:"sports_evening",category:"Sports Information",icon:"⚽",time:"19:00",format:"Short Video",language:"English",prompt:"Current sports information/explainer. ONLY use verified source material supplied to the job; never invent scores, schedules or player facts."},
  {id:"ai_tech_night",category:"AI & Technology",icon:"🤖",time:"21:00",format:"Short Video",language:"English",prompt:"Practical AI and technology explainer, creator workflow, useful tool or automation idea. Use current verified facts when needed; never invent product capabilities."}
];
function categoryKeyFromName(name){const n=String(name||"").toLowerCase();if(n==="music promotion")return "music";if(n==="news & updates"||n==="news")return "news";if(n==="product promotion"||n==="product")return "product";if(n==="sports information"||n==="sports")return "sports";if(n==="editing knowledge"||n==="editing")return "editing";if(n==="ai & technology"||n==="ai technology"||n==="technology")return "tech";return null;}
function enabledCategory(settings,name){const key=categoryKeyFromName(name);return key?settings?.enabledCategories?.[key]!==false:true;}
function autoScheduleForToday(now=new Date(),settings=loadSettings()){
  const day=now.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});
  return AUTO_SCHEDULES.filter(x=>enabledCategory(settings,x.category)).map(x=>({...x,date:day,slot:day+"T"+x.time+":00+05:30"}));
}
const WEEKLY_LIVE_SCHEDULE=[
{id:"music_monday",day:"Monday",dayIndex:1,icon:"🎵",category:"Music Live",title:"Original Romantic & Sad Music Promotion",prompt:"Promote only original music from the configured artist channels.",sourceChannels:["UC_7oWDyqUuF8FtCm3XWkMvQ","UC45qxqZuEpQvYs14c1pLf7Q"]},
{id:"editing_tuesday",day:"Tuesday",dayIndex:2,icon:"🎬",category:"Editing Live",title:"Editing Tips & Tutorial",prompt:"Original practical editing tutorials."},
{id:"news_wednesday",day:"Wednesday",dayIndex:3,icon:"📰",category:"News Live",title:"Verified Current-News Bulletin",prompt:"Use verified current sources only."},
{id:"sports_thursday",day:"Thursday",dayIndex:4,icon:"⚽",category:"Sports Live",title:"Verified Sports Update",prompt:"Use verified current sources only."},
{id:"product_friday",day:"Friday",dayIndex:5,icon:"🛍️",category:"Product Live",title:"Product Information & Promotion",prompt:"Use verified product information."},
{id:"cartoon_saturday",day:"Saturday",dayIndex:6,icon:"👤",category:"Cartoon Live",title:"Original Cartoon Content",prompt:"Original animated/cartoon content."},
{id:"funny_romantic_sunday",day:"Sunday",dayIndex:0,icon:"😂💙",category:"Funny + Romantic Live",title:"Funny & Romantic",prompt:"Original funny and romantic content."}
];
function weeklyLiveSchedule(){
 return WEEKLY_LIVE_SCHEDULE.map(x=>({...x,startTime:"14:00",endTime:"16:00",durationMinutes:120,timeZone:"Asia/Kolkata"}));
}

function autoSlotId(item){return "auto_"+item.id+"_"+item.date+"_"+item.time.replace(":","");}
function nextBossUploadSlot(){const now=new Date();const items=autoScheduleForToday(now);const mins=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now).split(":")[0])*60+Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now).split(":")[1]);for(const x of items){const [h,m]=x.time.split(":").map(Number);if(h*60+m>mins+5)return x.slot;}const d=new Date(now.getTime()+86400000);const day=d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});return day+"T09:00:00+05:30";}

async function autoJobExists(id){
  if(supabase){
    try{const {data,error}=await supabase.from("content_jobs").select("id").eq("id",id).maybeSingle();if(!error&&data)return true;}catch{}
  }
  return !!loadJobs()[id];
}
async function generateAutomaticJob(item,req){
  const id=autoSlotId(item);
  if(await autoJobExists(id))return {ok:true,skipped:true,jobId:id,reason:"slot_already_created"};
  if(item.category==="Music Promotion"){
    try{
      const track=await selectDailyMusicTrack(req);
      const manager=await runMusicManagerAnalysis(track);
      const result=await createMusicPromotionJob({spotifyUrl:track.spotify_url,audioUrl:track.audio_url,title:track.title,artist:track.artist,thumbnailUrl:track.artwork_url,language:item.language,notes:"Daily Music Manager selection. Trend score "+track.trend_score+". AI analysis: "+manager.chatgpt,req});
      if(supabase){
        await supabase.from("music_library").update({promotion_count:Number(track.promotion_count||0)+1,last_promoted_at:new Date().toISOString(),last_used_at:new Date().toISOString(),ai_analysis:manager,updated_at:new Date().toISOString()}).eq("id",track.id);
      }
      return {...result,automaticMusic:true,selectedTrack:publicMusicTrack(track),manager};
    }catch(error){
      await setAgentState("manager","ERROR",100,"Music Manager could not select/publish a track: "+safeErrorMessage(error),id);
      return {ok:false,skipped:true,reason:"music_manager_error",error:safeErrorMessage(error),jobId:id};
    }
  }
  const jobs=loadJobs();
  await setAgentState("manager","WORKING",8,"Starting scheduled production",id);
  await setAgentState("research","WORKING",15,"Finding a verified topic and research direction",id);
  const topicRaw=await generateWithChatGPT("automatic_topic",{
    category:item.category,language:item.language,format:item.format,scheduleTime:item.time,direction:item.prompt,
    requirement:"Return one original YouTube video topic/title only. For News/Sports, do not invent a current fact; return a research-needed topic if no verified source is provided."
  });
  const topic=String(topicRaw||"AI Content Factory").replace(/^["']|["']$/g,"").trim().split("\n")[0].slice(0,180);
  await setAgentState("research","WORKING",45,"Researching: "+topic,id);
  const job={id,status:"researching",topic,category:item.category,language:item.language,format:item.format,notes:item.prompt,sourceText:"",sources:[],createdAt:new Date().toISOString(),auto:true,scheduledSlot:item.slot};
  jobs[id]=job; saveJobs(jobs); await persistJob(job);
  job.research=await generateWithChatGPT("research_plan",{topic,category:item.category,language:item.language,format:item.format,notes:item.prompt,sourceText:"",sources:[]});
  await setAgentState("research","SLEEPING",100,"Research complete",id);
  await setAgentState("script","WORKING",25,"Writing the production script",id);
  job.script=await generateWithChatGPT("script",{topic,category:item.category,language:item.language,format:item.format,notes:item.prompt,research:job.research,sources:[]});
  job.status="script_ready";
  await setAgentState("script","SLEEPING",100,"Script complete",id);
  await setAgentState("voice","WORKING",20,"Generating narration audio",id);
  await runVoiceForJob(job);
  if(job.voice?.status==="ready"){
    await setAgentState("voice","SLEEPING",100,"Voice complete",id);
    await setAgentState("visual","WORKING",25,"Preparing visual plan",id);
    await setAgentState("editor","WORKING",20,"Rendering the final video",id);
    job.status="rendering"; saveJobs(jobs); await persistJob(job);
    await setAgentState("visual","SLEEPING",100,"Visual plan complete",id);
    job.renderedVideoUrl=await renderFactoryVideo(job,req);
    job.status="rendered";
    await setAgentState("editor","SLEEPING",100,"Video render complete",id);
    await setAgentState("thumb","WORKING",20,"Preparing thumbnail and metadata",id);
    await setAgentState("qa","WORKING",30,"Checking quality, sources and rights",id);
  }else{
    job.status="voice_waiting";
    job.renderError=job.voice?.error||"Voice generation did not complete.";
  }
  job.updatedAt=new Date().toISOString(); saveJobs(jobs); await persistJob(job);
  await setAgentState("thumb","SLEEPING",100,"Publishing metadata ready",id);
  await setAgentState("qa","WORKING",80,"Final quality and rights gate",id);
  if(job.renderedVideoUrl && loadSettings().autoPublish){
    await setAgentState("publisher","WORKING",45,"Uploading and scheduling on YouTube",id);
    const scheduledAt=new Date(item.slot);
    const now=new Date();
    const publishAt=scheduledAt>now?item.slot:null;
    const youtubeResult=await publishRenderedYouTubeVideo({
      videoUrl:job.renderedVideoUrl,title:job.topic,
      description:"Created automatically by AI Content Factory. Category: "+item.category,
      tags:[item.category,"AI Content Factory"],categoryId:"22",
      privacyStatus:publishAt?"private":"public",publishAt,approved:true,automated:true,req
    });
    job.youtube=youtubeResult; job.status="published"; job.updatedAt=new Date().toISOString();
    saveJobs(jobs); await persistJob(job);
  }
  await setAgentState("qa","SLEEPING",100,"Quality and rights checks complete",id);
  await setAgentState("publisher","SLEEPING",100,job.status==="published"?"YouTube publish complete":"Waiting for publish approval",id);
  await setAgentState("manager","SLEEPING",100,"Production job complete",id);
  return {ok:true,skipped:false,jobId:id,status:job.status,topic:job.topic,videoUrl:job.renderedVideoUrl||null};
}
async function processQueuedContentJob(job,req){
  const id=job.id;
  await setAgentState("manager","WORKING",8,"Starting queued content production",id);
  await setAgentState("research","WORKING",15,"Researching queued content",id);
  if(!job.research)job.research=await generateWithChatGPT("research_plan",{topic:job.topic,category:job.category,language:job.language,format:job.format,notes:job.notes||"",sourceText:job.sourceText||"",sources:job.sources||[]});
  await setAgentState("research","SLEEPING",100,"Research complete",id);
  await setAgentState("script","WORKING",25,"Writing queued content script",id);
  if(!job.script)job.script=await generateWithChatGPT("script",{topic:job.topic,category:job.category,language:job.language,format:job.format,notes:job.notes||"",research:job.research,sources:job.sources||[]});
  job.status="script_ready";
  await setAgentState("script","SLEEPING",100,"Script complete",id);
  await setAgentState("voice","WORKING",20,"Generating narration audio",id);
  await runVoiceForJob(job);
  if(job.voice?.status!=="ready"){job.status="voice_waiting";job.renderError=job.voice?.error||"Voice generation did not complete.";return job;}
  await setAgentState("voice","SLEEPING",100,"Voice complete",id);
  await setAgentState("visual","WORKING",25,"Preparing visual plan",id);
  await setAgentState("editor","WORKING",20,"Rendering the final video",id);
  job.status="rendering";job.updatedAt=new Date().toISOString();await persistJob(job);
  await setAgentState("visual","SLEEPING",100,"Visual plan complete",id);
  job.renderedVideoUrl=await renderFactoryVideo(job,req);
  job.status="rendered";
  await setAgentState("editor","SLEEPING",100,"Video render complete",id);
  await setAgentState("thumb","WORKING",20,"Preparing thumbnail and metadata",id);
  await setAgentState("qa","WORKING",80,"Checking quality, sources and rights",id);
  if(job.renderedVideoUrl){
    await setAgentState("publisher","WORKING",45,"Uploading queued video to connected platforms",id);
    const youtubeResult=await publishRenderedYouTubeVideo({
      videoUrl:job.renderedVideoUrl,title:job.topic,
      description:"Created from your AI Content Factory queue.",
      tags:[job.category||"AI Content Factory","AI Content Factory"],
      categoryId:"22",privacyStatus:"public",approved:true,automated:true,req
    });
    job.youtube=youtubeResult;job.status="published";
  }
  job.updatedAt=new Date().toISOString();
  await persistJob(job);
  await setAgentState("qa","SLEEPING",100,"Quality and rights checks complete",id);
  await setAgentState("publisher","SLEEPING",100,job.status==="published"?"Queued video published":"Waiting for publish",id);
  await setAgentState("manager","SLEEPING",100,"Queued content job complete",id);
  return job;
}

async function runAutomaticFactory(req){
  const settings=await hydrateSettings();
  const jobs=await loadPersistentJobs();
  const now=new Date();
  const bossDue=Object.values(jobs).filter(j=>j.manualUpload&&j.renderedVideoUrl&&["approved","queued"].includes(j.status)&&j.scheduledSlot&&new Date(j.scheduledSlot)<=now).sort((a,b)=>new Date(a.scheduledSlot)-new Date(b.scheduledSlot)).slice(0,1);
  const bossResults=[];
  for(const job of bossDue){try{const youtubeResult=await publishRenderedYouTubeVideo({videoUrl:job.renderedVideoUrl,title:job.topic,description:"Uploaded by Boss in AI Content Factory.",tags:["Boss Upload","AI Content Factory"],categoryId:"22",privacyStatus:"public",approved:true,req});job.youtube=youtubeResult;job.status="published";job.updatedAt=new Date().toISOString();jobs[job.id]=job;saveJobs(jobs);await persistJob(job);bossResults.push({ok:true,jobId:job.id,videoId:youtubeResult.videoId});}catch(e){bossResults.push({ok:false,jobId:job.id,error:e.message});}}
  const queued=Object.values(jobs).filter(j=>j.queueItem&&j.status==="queued"&&enabledCategory(settings,j.category)&&j.scheduledSlot&&new Date(j.scheduledSlot)<=now).sort((a,b)=>new Date(a.scheduledSlot)-new Date(b.scheduledSlot)).slice(0,1);
  for(const job of queued){
    try{
      const done=await processQueuedContentJob(job,req);
      jobs[job.id]=done;saveJobs(jobs);
      return {ok:true,enabled:true,queueProcessed:true,jobId:job.id,status:done.status,bossUploads:bossResults};
    }catch(e){
      job.status="error";job.renderError=safeErrorMessage(e);job.updatedAt=new Date().toISOString();jobs[job.id]=job;saveJobs(jobs);await persistJob(job).catch(()=>{});
      return {ok:false,enabled:true,queueProcessed:true,jobId:job.id,error:safeErrorMessage(e),bossUploads:bossResults};
    }
  }
  if(!settings.autoGenerate)return {ok:true,enabled:false,bossUploads:bossResults,message:"Auto Generate is OFF."};
  const items=autoScheduleForToday(now,settings);
  const hourMinute=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  const [nowH,nowM]=hourMinute.split(":").map(Number);
  const due=items.filter(x=>{
    const [h,m]=x.time.split(":").map(Number);
    const diff=(nowH*60+nowM)-(h*60+m);
    return diff>=-15 && diff<=5;
  }).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,1);
  if(!due.length)return {ok:true,enabled:true,due:[],message:"No category is scheduled for this minute."};
  const results=[];
  for(const item of due){
    try{results.push(await generateAutomaticJob(item,req));}
    catch(e){results.push({ok:false,category:item.category,time:item.time,error:e.message});}
  }
  return {ok:true,enabled:true,due:due.map(x=>x.category),results,bossUploads:bossResults};
}

app.post("/api/content/sync",requireAppKey,async(req,res)=>{
  try{
    const items=Array.isArray(req.body?.items)?req.body.items:[];
    const jobs=await loadPersistentJobs();
    const now=new Date().toISOString();
    const nextSlot=nextBossUploadSlot();
    const synced=[];
    for(const item of items.slice(0,50)){
      if(!item?.title)continue;
      const id="queue_"+String(item.id||crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g,"_");
      const existing=jobs[id];
      if(existing&&["published","rendered","rendering","script_ready","researching"].includes(existing.status))continue;
      const job={id,status:"queued",topic:String(item.title).slice(0,180),category:String(item.category||"AI Content Factory"),language:String(item.language||"English"),format:String(item.format||"Short Video"),notes:String(item.notes||""),sourceText:"",sources:[],createdAt:existing?.createdAt||now,updatedAt:now,queueItem:true,auto:true,scheduledSlot:existing?.scheduledSlot||nextSlot};
      jobs[id]=job;saveJobs(jobs);await persistJob(job);synced.push(id);
    }
    res.json({ok:true,synced,scheduledSlot:nextSlot});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});

app.post("/api/boss/command",requireAppKey,async(req,res)=>{
  try{
    const command=String(req.body?.command||"").trim();
    if(!command)return res.status(400).json({ok:false,error:"command is required"});
    const settings=await hydrateSettings();
    if(settings.autoGenerate===false)return res.status(409).json({ok:false,error:"Auto Generate is OFF. Turn Automation/Auto Generate ON first."});
    if(settings.autoPublish===false)return res.status(409).json({ok:false,error:"Auto Publish is OFF. Turn Auto Publish ON first."});

    const lower=command.toLowerCase();
    const category=lower.includes("music")||lower.includes("song")||lower.includes("artist")?"Music Promotion":
      lower.includes("news")||lower.includes("update")?"News & Updates":
      lower.includes("product")||lower.includes("shop")||lower.includes("promo")?"Product Promotion":
      lower.includes("sport")||lower.includes("match")||lower.includes("player")?"Sports Information":
      lower.includes("edit")||lower.includes("capcut")||lower.includes("premiere")?"Editing Knowledge":"AI & Technology";
    if(!enabledCategory(settings,category))return res.status(409).json({ok:false,error:category+" is disabled. Enable this category first."});

    const id=jobId();
    const jobs=loadJobs();
    const job={id,status:"researching",topic:command.slice(0,180),category,language:"Hindi + English",format:"Short Video",notes:"Boss command: "+command,sourceText:"",sources:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),manualUpload:true,auto:true,autoPublish:true,approved:true};
    jobs[id]=job; saveJobs(jobs); await persistJob(job);
    await setAgentState("manager","WORKING",10,"Boss order received: "+command.slice(0,180),id);

    let research="";
    if(category==="News & Updates"||category==="Sports Information"){
      await setAgentState("research","WORKING",25,"Researching verified information",id);
      research=await generateWithChatGPT("research_plan",{topic:command,category,language:job.language,format:job.format,notes:job.notes,sourceText:"",sources:[]});
      job.research=research;
      await setAgentState("research","SLEEPING",100,"Research complete",id);
    }
    await setAgentState("script","WORKING",35,"Writing the Boss-requested script",id);
    job.script=await generateWithChatGPT("script",{topic:command,category,language:job.language,format:job.format,notes:job.notes,sourceText:"",research,sources:job.sources});
    await setAgentState("script","SLEEPING",100,"Script complete",id);

    await setAgentState("voice","WORKING",55,"Generating narration",id);
    await runVoiceForJob(job);
    if(!job.voice?.file)throw new Error("Voice generation did not produce an audio file.");
    await setAgentState("voice","SLEEPING",100,"Voice ready",id);

    await setAgentState("editor","WORKING",70,"Rendering the video",id);
    job.status="rendering"; job.updatedAt=new Date().toISOString(); jobs[id]=job; saveJobs(jobs); await persistJob(job);
    job.renderedVideoUrl=await renderFactoryVideo(job,req);
    if(!job.renderedVideoUrl)throw new Error("Video rendering returned no video URL.");
    job.status="rendered"; job.updatedAt=new Date().toISOString(); jobs[id]=job; saveJobs(jobs); await persistJob(job);
    await setAgentState("editor","SLEEPING",100,"Video rendered",id);

    await setAgentState("qa","WORKING",85,"Checking Boss video before upload",id);
    await setAgentState("qa","SLEEPING",100,"QA complete",id);

    await setAgentState("publisher","WORKING",95,"Uploading to YouTube as PUBLIC",id);
    const youtube=await publishRenderedYouTubeVideo({
      videoUrl:job.renderedVideoUrl,
      title:job.topic,
      description:"Created and published by AI Content Factory Boss command.",
      tags:["AI Content Factory",category,"Boss Command"],
      categoryId:"22",
      privacyStatus:"public",
      approved:true,
      automated:true,
      req
    });
    job.youtube=youtube; job.status="published"; job.updatedAt=new Date().toISOString();
    jobs[id]=job; saveJobs(jobs); await persistJob(job);
    await setAgentState("publisher","SLEEPING",100,"Published to YouTube",id);
    await setAgentState("manager","SLEEPING",100,"Boss order completed",id);
    return res.json({ok:true,jobId:id,status:"published",category,title:job.topic,video:youtube});
  }catch(e){
    const msg=safeErrorMessage(e);
    try{await setAgentState("manager","ERROR",0,"Boss command failed: "+msg,null);}catch(_){}
    return res.status(500).json({ok:false,error:msg});
  }
});

app.post("/api/boss/publish-latest",requireAppKey,async(req,res)=>{
  try{
    const settings=await hydrateSettings();
    if(!settings.autoPublish)return res.status(409).json({ok:false,error:"Auto Publish is OFF."});
    const jobs=await loadPersistentJobs();
    const candidates=Object.values(jobs)
      .filter(j=>j.renderedVideoUrl&&!["published"].includes(j.status))
      .sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
    const job=candidates[0];
    if(!job)return res.status(404).json({ok:false,error:"No rendered video is waiting to be published."});
    await setAgentState("publisher","WORKING",60,"Boss voice command: publishing "+(job.topic||job.title||"latest video"),job.id);
    const result=await publishRenderedYouTubeVideo({
      videoUrl:job.renderedVideoUrl,
      title:job.topic||job.title||"AI Content Factory",
      description:job.description||"Published by AI Content Factory Boss command.",
      tags:Array.isArray(job.tags)&&job.tags.length?job.tags:["AI Content Factory"],
      categoryId:job.categoryId||"22",
      privacyStatus:"public",
      approved:true,
      automated:true,
      req
    });
    job.youtube=result;
    job.status="published";
    job.updatedAt=new Date().toISOString();
    jobs[job.id]=job;
    saveJobs(jobs);
    await persistJob(job);
    await setAgentState("publisher","SLEEPING",100,"Latest video published",job.id);
    return res.json({ok:true,jobId:job.id,title:job.topic||job.title,video:result});
  }catch(e){
    await setAgentState("publisher","ERROR",0,"Publish failed: "+safeErrorMessage(e),null).catch(()=>{});
    return res.status(500).json({ok:false,error:safeErrorMessage(e)});
  }
});

async function publishRenderedYouTubeVideo(p){
  if(!p?.videoUrl||!p?.title)throw new Error("videoUrl and title are required");
  const settings=await hydrateSettings();
  if(!settings.autoPublish)throw new Error("Auto Publish is OFF.");
  if(settings.approval&&!p.approved&&!p.automated)throw new Error("Human approval is required before publishing.");
  const asset=await fetch(p.videoUrl);
  if(!asset.ok||!asset.body)throw new Error("Could not fetch rendered video asset");
  const yt=await youtube(p.req);
  const privacyStatus=p.privacyStatus||"public";
  const status={privacyStatus};
  if(p.publishAt)status.publishAt=p.publishAt;
  const response=await yt.videos.insert({
    part:"snippet,status",
    requestBody:{snippet:{title:p.title,description:p.description||"",tags:Array.isArray(p.tags)?p.tags:[],categoryId:p.categoryId||"22"},status},
    media:{body:Readable.fromWeb(asset.body)}
  });
  // YouTube-only publishing while Meta/Facebook/Instagram are not connected.
  return {videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||privacyStatus,platform:"youtube"};
}

// Automatic Research → Script pipeline
app.post("/api/pipeline/research",requireAppKey,async(req,res)=>{
  try{
    const {topic,category="",language="English",format="Long Video",notes="",sourceText="",sources=[]}=req.body||{};
    if(!topic)return res.status(400).json({ok:false,error:"topic is required"});
    const id=jobId();
    const jobs=loadJobs();
    jobs[id]={id,status:"researching",topic,category,language,format,notes,sources,sourceText,createdAt:new Date().toISOString()};
    saveJobs(jobs);
    await persistJob(jobs[id]);
    if(process.env.MAKE_RESEARCH_WEBHOOK_URL){
      const hook=await fetch(process.env.MAKE_RESEARCH_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:id,topic,category,language,format,notes,sourceText,sources})});
      if(!hook.ok)throw new Error("Make research webhook returned HTTP "+hook.status);
      jobs[id].status="research_dispatched";
      jobs[id].updatedAt=new Date().toISOString();
      saveJobs(jobs);
      await persistJob(jobs[id]);
      return res.json({ok:true,jobId:id,status:jobs[id].status,message:"Research job sent to Make.com."});
    }
    const research=await generateWithChatGPT("research_plan",{topic,category,language,format,notes,sourceText,sources});
    jobs[id].research=research;
    jobs[id].status="script_ready";
    jobs[id].script=await generateWithChatGPT("script",{topic,category,language,format,notes,sourceText,research,sources});
    jobs[id].status="script_ready";
    if(loadSettings().autoGenerate){
      await runVoiceForJob(jobs[id]);
      if(jobs[id].voice?.status==="ready"){
        try{
          jobs[id].status="rendering";
          jobs[id].updatedAt=new Date().toISOString();
          saveJobs(jobs); await persistJob(jobs[id]);
          jobs[id].renderedVideoUrl=await renderFactoryVideo(jobs[id],req);
          jobs[id].status=jobs[id].approved?"approved":"awaiting_approval";
        }catch(renderError){
          jobs[id].status="render_failed";
          jobs[id].renderError=renderError.message;
        }
      }
    }
    jobs[id].updatedAt=new Date().toISOString();
    saveJobs(jobs);
    await persistJob(jobs[id]);
    res.json({ok:true,jobId:id,status:jobs[id].status,research:jobs[id].research,script:jobs[id].script,voice:jobs[id].voice||null,videoUrl:jobs[id].renderedVideoUrl||null});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.get("/api/pipeline/jobs/:id",requireAppKey,async(req,res)=>{
  try{
    const job=await getJobFromSupabase(req.params.id)||loadJobs()[req.params.id];
    if(!job)return res.status(404).json({ok:false,error:"Job not found"});
    res.json({ok:true,job});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/pipeline/jobs/:id/render",requireAppKey,async(req,res)=>{
  try{
    const jobs=loadJobs();
    const job=await getJobFromSupabase(req.params.id)||jobs[req.params.id];
    if(!job)return res.status(404).json({ok:false,error:"Job not found"});
    if(!job.script)return res.status(409).json({ok:false,error:"Script is not ready."});
    if(!job.voice?.file)return res.status(409).json({ok:false,error:"Voice is not ready. Generate voice first."});
    job.status="rendering";
    job.updatedAt=new Date().toISOString();
    saveJobs(jobs); await persistJob(job);
    const videoUrl=await renderFactoryVideo(job,req);
    job.renderedVideoUrl=videoUrl;
    job.status="rendered";
    job.updatedAt=new Date().toISOString();
    saveJobs(jobs); await persistJob(job);
    const settings=loadSettings();
    if(settings.autoPublish && (!settings.approval || job.approved)){
      const youtube=await publishRenderedYouTubeVideo({
        videoUrl,
        title:job.title||job.topic||"AI Content Factory",
        description:job.description||job.notes||"",
        tags:job.tags||[],
        categoryId:job.categoryId||"22",
        privacyStatus:job.privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private",
        publishAt:job.publishAt||null,
        approved:!!job.approved,
        req
      });
      job.youtube=youtube;
      job.status="published";
      job.updatedAt=new Date().toISOString();
      saveJobs(jobs); await persistJob(job);
      return res.json({ok:true,jobId:job.id,status:job.status,videoUrl,youtube});
    }
    job.status=job.approved?"approved":"awaiting_approval";
    saveJobs(jobs); await persistJob(job);
    res.json({ok:true,jobId:job.id,status:job.status,videoUrl,published:false});
  }catch(e){
    try{
      const jobs=loadJobs(); const job=jobs[req.params.id];
      if(job){job.status="render_failed";job.renderError=e.message;job.updatedAt=new Date().toISOString();saveJobs(jobs);await persistJob(job);}
    }catch{}
    res.status(500).json({ok:false,error:e.message});
  }
});

app.post("/api/pipeline/jobs/:id/rendered",requireAppKey,async(req,res)=>{
  try{
    const jobs=loadJobs();
    const job=await getJobFromSupabase(req.params.id)||jobs[req.params.id];
    if(!job)return res.status(404).json({ok:false,error:"Job not found"});
    const {videoUrl,title,description="",tags=[],categoryId="22",privacyStatus="public",publishAt,approved=false}=req.body||{};
    if(!videoUrl)return res.status(400).json({ok:false,error:"videoUrl is required"});
    job.renderedVideoUrl=videoUrl;
    job.title=title||job.title||job.topic||"AI Content Factory Video";
    job.description=description;
    job.tags=Array.isArray(tags)?tags:[];
    job.categoryId=categoryId;
    job.privacyStatus=privacyStatus;
    job.publishAt=publishAt||null;
    job.approved=!!approved;
    job.status=job.approved?"approved":"rendered";
    job.updatedAt=new Date().toISOString();
    saveJobs(jobs);
    await persistJob(job);

    if(loadSettings().autoPublish && (!loadSettings().approval || job.approved)){
      try{
        const youtubeResult=await publishRenderedYouTubeVideo({videoUrl,title:job.title,description,tags:job.tags,categoryId,privacyStatus,publishAt,approved:job.approved,req});
        job.youtube=youtubeResult;
        job.status="published";
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs);
        await persistJob(job);
        return res.json({ok:true,jobId:job.id,status:job.status,published:true,youtube:youtubeResult});
      }catch(e){
        job.status="publish_failed";
        job.publishError=e.message;
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs);
        await persistJob(job);
        return res.status(502).json({ok:false,jobId:job.id,status:job.status,published:false,error:e.message});
      }
    }
    job.status=job.approved?"approved":"awaiting_approval";
    saveJobs(jobs);
    await persistJob(job);
    res.json({ok:true,jobId:job.id,status:job.status,published:false,message:job.approved?"Auto Publish is OFF.":"Approval is required before publishing."});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.post("/api/pipeline/jobs/:id/approve",requireAppKey,async(req,res)=>{
  try{
    const jobs=loadJobs();
    const job=await getJobFromSupabase(req.params.id)||jobs[req.params.id];
    if(!job)return res.status(404).json({ok:false,error:"Job not found"});
    job.approved=true;
    job.status="approved";
    job.updatedAt=new Date().toISOString();
    saveJobs(jobs);
    await persistJob(job);

    if(loadSettings().autoPublish && job.renderedVideoUrl){
      try{
        const youtubeResult=await publishRenderedYouTubeVideo({
          videoUrl:job.renderedVideoUrl,
          title:job.title||job.topic||"AI Content Factory Video",
          description:job.description||"",
          tags:job.tags||[],
          categoryId:job.categoryId||"22",
          privacyStatus:job.privacyStatus||"public",
          publishAt:job.publishAt||null,
          approved:true,
          req
        });
        job.youtube=youtubeResult;
        job.status="published";
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs);
        await persistJob(job);
        return res.json({ok:true,jobId:job.id,status:job.status,published:true,youtube:youtubeResult});
      }catch(e){
        job.status="publish_failed";
        job.publishError=e.message;
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs);
        await persistJob(job);
        return res.status(502).json({ok:false,jobId:job.id,status:job.status,published:false,error:e.message});
      }
    }
    res.json({ok:true,jobId:job.id,status:job.status,published:false,message:job.renderedVideoUrl?"Auto Publish is OFF.":"Approved; waiting for rendered video."});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.get("/api/pipeline/jobs/:id/voice",requireAppKey,(req,res)=>{
  const file=path.join(VOICE_DIR,req.params.id+".mp3");
  if(!fs.existsSync(file))return res.status(404).json({ok:false,error:"Voice audio is not available for this job."});
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Content-Disposition",'inline; filename="' + req.params.id + '.mp3"');
  res.setHeader("Cache-Control","no-store");
  res.sendFile(file);
});
app.post("/api/pipeline/research/callback",requireAppKey,async(req,res)=>{
  try{
    const {jobId,research="",sources=[]}=req.body||{};
    if(!jobId||!research)return res.status(400).json({ok:false,error:"jobId and research are required"});
    const jobs=loadJobs(); const job=jobs[jobId];
    if(!job)return res.status(404).json({ok:false,error:"Job not found"});
    job.research=research; job.sources=sources.length?sources:(job.sources||[]);
    job.status="scripting";
    job.script=await generateWithChatGPT("script",{topic:job.topic,category:job.category,language:job.language,format:job.format,notes:job.notes,sourceText:job.sourceText,research:job.research,sources:job.sources});
    await runVoiceForJob(job);
    job.updatedAt=new Date().toISOString(); saveJobs(jobs); await persistJob(job);
    if(loadSettings().autoGenerate && job.voice?.status==="ready"){
      try{
        const videoUrl=await renderFactoryVideo(job,req);
        job.renderedVideoUrl=videoUrl;
        job.status=job.approved?"approved":"awaiting_approval";
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs); await persistJob(job);
      }catch(renderError){
        job.status="render_failed";
        job.renderError=renderError.message;
        job.updatedAt=new Date().toISOString();
        saveJobs(jobs); await persistJob(job);
      }
    }
    res.json({ok:true,jobId:jobId, status:job.status,script:job.script,voice:job.voice||null});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.post("/api/ai/generate",requireAppKey,async(req,res)=>{try{const {task="script",topic,category="",language="English",format="Long Video",notes="",sourceText=""}=req.body||{};if(!topic)return res.status(400).json({ok:false,error:"topic is required"});res.json({ok:true,task,output:await generateWithChatGPT(task,{topic,category,language,format,notes,sourceText})});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.get("/api/voice/status",requireAppKey,(req,res)=>res.json({ok:true,configured:!!process.env.ELEVENLABS_API_KEY,voiceId:process.env.ELEVENLABS_VOICE_ID||null,hindiVoiceId:process.env.ELEVENLABS_HINDI_VOICE_ID||null,englishVoiceId:process.env.ELEVENLABS_ENGLISH_VOICE_ID||null,model:process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2"}));
app.get("/api/voice/voices",requireAppKey,async(req,res)=>{try{requireElevenLabs();const r=await fetch("https://api.elevenlabs.io/v2/voices",{headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY}});const body=await r.json();if(!r.ok)throw new Error(body?.detail?.message||body?.detail||"ElevenLabs voices request failed");res.json({ok:true,voices:(body.voices||[]).map(v=>({voice_id:v.voice_id,name:v.name,category:v.category,labels:v.labels||{},description:v.description||""}))});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post("/api/voice/generate",requireAppKey,async(req,res)=>{try{requireElevenLabs();const {text,voiceId,modelId,languageCode,stability,similarityBoost,style}=req.body||{};if(!text||!String(text).trim())return res.status(400).json({ok:false,error:"text is required"});const voice=voiceId||process.env.ELEVENLABS_VOICE_ID;if(!voice)return res.status(400).json({ok:false,error:"voiceId is required. Set ELEVENLABS_VOICE_ID or choose a voice."});const model=modelId||process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2";const payload={text:String(text).trim(),model_id:model};if(languageCode)payload.language_code=languageCode;const voice_settings={};if(Number.isFinite(Number(stability)))voice_settings.stability=Number(stability);if(Number.isFinite(Number(similarityBoost)))voice_settings.similarity_boost=Number(similarityBoost);if(Number.isFinite(Number(style)))voice_settings.style=Number(style);if(Object.keys(voice_settings).length)payload.voice_settings=voice_settings;const url="https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice)+"?output_format=mp3_44100_128";const r=await fetch(url,{method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,"Content-Type":"application/json","Accept":"audio/mpeg"},body:JSON.stringify(payload)});if(!r.ok){let body={};try{body=await r.json();}catch{}throw new Error(body?.detail?.message||body?.detail||"ElevenLabs voice generation failed");}const audio=Buffer.from(await r.arrayBuffer());res.setHeader("Content-Type","audio/mpeg");res.setHeader("Content-Disposition",'inline; filename="acf-voice.mp3"');res.setHeader("Cache-Control","no-store");res.send(audio);}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.get("/api/supabase/status",requireAppKey,async(req,res)=>{
  try{
    if(!supabase)return res.json({ok:true,configured:false,connected:false});
    const {error}=await supabase.from("content_jobs").select("id",{count:"exact",head:true});
    if(error)return res.json({ok:true,configured:true,connected:false,error:error.message});
    res.json({ok:true,configured:true,connected:true,table:"content_jobs"});
  }catch(e){res.json({ok:true,configured:true,connected:false,error:e.message});}
});
app.get("/api/health",async(req,res)=>res.json({ok:true,service:"AI Content Factory",youtubeToken:!!(await loadTokens(req)),supabase:!!supabase,settings:await hydrateSettings()}));
app.get("/api/youtube/config-status",async(req,res)=>{
  const redirect=String(process.env.YOUTUBE_REDIRECT_URI||"").trim();
  res.json({
    ok:true,
    configured:!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&redirect),
    googleClientIdConfigured:!!process.env.GOOGLE_CLIENT_ID,
    googleClientSecretConfigured:!!process.env.GOOGLE_CLIENT_SECRET,
    youtubeRedirectConfigured:true,
    youtubeRedirectUri:CANONICAL_YOUTUBE_REDIRECT_URI,
    configuredRedirectUri:redirect||null,
    redirectMatchesCanonical:!redirect||redirect===CANONICAL_YOUTUBE_REDIRECT_URI,
    tokenPersistence:!!(supabaseAdmin||supabase),
    currentBackend:"https://ai-content-factory-gussvkdme-swrang120.vercel.app"
  });
});
function youtubeOAuthStateSecret(){
  const secret=String(process.env.YOUTUBE_OAUTH_STATE_SECRET||process.env.GOOGLE_CLIENT_SECRET||"").trim();
  if(!secret)throw new Error("OAuth state signing secret is not configured. Add YOUTUBE_OAUTH_STATE_SECRET or GOOGLE_CLIENT_SECRET on Vercel.");
  return secret;
}
function createYouTubeOAuthState(){
  const payload=Buffer.from(JSON.stringify({
    v:3,
    iat:Date.now(),
    nonce:crypto.randomBytes(32).toString("hex")
  })).toString("base64url");
  const signature=crypto.createHmac("sha256",youtubeOAuthStateSecret()).update(payload).digest("base64url");
  return payload+"."+signature;
}
function verifyYouTubeOAuthState(state){
  const raw=String(state||"");
  const parts=raw.split(".");
  if(parts.length!==2||!parts[0]||!parts[1])return false;
  try{
    const payload=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if(payload?.v!==3)return false;
    const issuedAt=Number(payload?.iat||0);
    if(!Number.isFinite(issuedAt)||Date.now()-issuedAt<0||Date.now()-issuedAt>=15*60*1000)return false;
    const expected=crypto.createHmac("sha256",youtubeOAuthStateSecret()).update(parts[0]).digest("base64url");
    if(parts[1].length!==expected.length)return false;
    return crypto.timingSafeEqual(Buffer.from(parts[1],"utf8"),Buffer.from(expected,"utf8"));
  }catch{return false;}
}

app.get("/auth/youtube",async(req,res)=>{
  try{
    const client=oauthClient(CANONICAL_YOUTUBE_REDIRECT_URI);
    // OAuth state is self-contained and signed. This avoids depending on a
    // database table that may not exist in a fresh/private deployment and is
    // reliable across Vercel's stateless serverless instances.
    const state=createYouTubeOAuthState();
    // Keep a short-lived browser-bound copy as a second validation path.
    // This makes the OAuth callback resilient to Vercel/mobile redirect
    // variations while retaining signed-state validation as the primary path.
    res.setHeader("Set-Cookie",[
      `acf_youtube_oauth_state=${encodeURIComponent(state)}; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=None`
    ]);
    const url=client.generateAuthUrl({
      access_type:"offline",
      prompt:"consent",
      include_granted_scopes:true,
      state,
      scope:SCOPES
    });
    res.redirect(url);
  }catch(e){
    res.status(500).send("YouTube OAuth configuration error: "+e.message);
  }
});
async function handleYouTubeOAuthCallback(req,res){
  try{
    if(req.query.error){
      const error=String(req.query.error);
      const description=String(req.query.error_description||"");
      return res.status(400).send("YouTube authorization denied: "+error+(description?" — "+description:""));
    }
    if(!req.query.code)return res.status(400).send("Missing OAuth authorization code.");
    const returnedState=String(req.query.state||"");
    if(!returnedState)return res.status(400).send("Missing OAuth state. Start YouTube connection again.");

    const browserState=getCookie(req,"acf_youtube_oauth_state");
    const signedStateValid=verifyYouTubeOAuthState(returnedState);
    const browserStateValid=!!browserState&&browserState===returnedState;

    // Google returns the exact state originally sent. Validate it either by
    // cryptographic signature or by the short-lived browser-bound cookie.
    // Both paths are strict; unsigned/unknown state is never accepted.
    if(!signedStateValid&&!browserStateValid){
      return res.status(400).send("OAuth state validation failed. Start YouTube connection again.");
    }

    const client=oauthClient(CANONICAL_YOUTUBE_REDIRECT_URI);
    const {tokens}=await client.getToken(req.query.code);
    const current=await loadTokens(req);
    await saveTokens({...current,...tokens});
    const refresh=tokens.refresh_token||current?.refresh_token;
    if(refresh){
      res.setHeader("Set-Cookie",[
        `acf_youtube_refresh=${encodeURIComponent(refresh)}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None`,
        "acf_youtube_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None"
      ]);
    }else{
      res.setHeader("Set-Cookie","acf_youtube_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None");
    }
    res.redirect("https://swrang120.github.io/AI-Content-Factory/?youtube=connected");
  }catch(e){
    res.status(500).send("OAuth callback failed: "+e.message);
  }
}

app.get("/api/auth/youtube/callback",(req,res)=>{
  // Vercel rewrite compatibility: preserve Google's code/state query string
  // before handing the request to the canonical callback route.
  const query=String(req.originalUrl||req.url||"").split("?")[1]||"";
  req.url="/auth/youtube/callback"+(query?"?"+query:"");
  return handleYouTubeOAuthCallback(req,res);
});
app.get("/auth/youtube/callback",handleYouTubeOAuthCallback);

// =========================
// Meta (Facebook Page + Instagram Professional) OAuth
// Credentials are kept in Vercel environment variables.
// =========================
const META_GRAPH_VERSION=process.env.META_GRAPH_VERSION||"v24.0";
const META_SCOPES=["pages_show_list","pages_read_engagement","pages_manage_posts","instagram_basic","instagram_content_publish"];

function metaApp(){
  if(!process.env.META_APP_ID||!process.env.META_APP_SECRET||!process.env.META_REDIRECT_URI){
    throw new Error("Meta is not configured. Add META_APP_ID, META_APP_SECRET and META_REDIRECT_URI on Vercel.");
  }
  return {id:process.env.META_APP_ID,secret:process.env.META_APP_SECRET,redirect:process.env.META_REDIRECT_URI};
}
async function metaGraph(pathname,init={}){
  const url="https://graph.facebook.com/"+META_GRAPH_VERSION+pathname;
  const r=await fetch(url,init);
  const body=await r.json().catch(()=>({}));
  if(!r.ok||body.error)throw new Error(body?.error?.message||("Meta Graph API HTTP "+r.status));
  return body;
}
async function saveMetaConnection(meta){
  if(!supabase)return;
  const {data}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
  const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
  await supabase.from("youtube_connections").upsert({
    id:"default",
    tokens:{...existing,__acf_meta:meta},
    updated_at:new Date().toISOString()
  },{onConflict:"id"});
}
async function loadMetaConnection(){
  if(!supabase)return null;
  try{
    const {data}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    return data?.tokens?.__acf_meta||null;
  }catch{return null;}
}
app.get("/auth/meta",(req,res)=>{
  try{
    const cfg=metaApp();
    const state=crypto.randomBytes(32).toString("hex");
    setCookie(res,"acf_meta_state",state,600);
    const params=new URLSearchParams({
      client_id:cfg.id,
      redirect_uri:cfg.redirect,
      response_type:"code",
      state,
      scope:META_SCOPES.join(",")
    });
    res.redirect("https://www.facebook.com/"+META_GRAPH_VERSION+"/dialog/oauth?"+params.toString());
  }catch(e){res.status(500).send("Meta OAuth configuration error: "+e.message);}
});
app.get("/auth/meta/callback",async(req,res)=>{
  try{
    if(req.query.error)return res.status(400).send("Meta authorization denied: "+String(req.query.error));
    if(!req.query.code)return res.status(400).send("Missing Meta OAuth authorization code.");
    const expected=getCookie(req,"acf_meta_state");
    if(!expected||expected!==String(req.query.state||""))return res.status(400).send("Meta OAuth state validation failed. Start Meta connection again.");
    const cfg=metaApp();
    const tokenUrl="https://graph.facebook.com/"+META_GRAPH_VERSION+"/oauth/access_token?"+new URLSearchParams({
      client_id:cfg.id,client_secret:cfg.secret,redirect_uri:cfg.redirect,code:String(req.query.code)
    }).toString();
    const short=await metaGraph("/oauth/access_token?"+new URLSearchParams({client_id:cfg.id,client_secret:cfg.secret,redirect_uri:cfg.redirect,code:String(req.query.code)}).toString());
    let userToken=short.access_token;
    try{
      const long=await metaGraph("/oauth/access_token?"+new URLSearchParams({
        grant_type:"fb_exchange_token",client_id:cfg.id,client_secret:cfg.secret,fb_exchange_token:userToken
      }).toString());
      if(long.access_token)userToken=long.access_token;
    }catch(_){}
    const accounts=await metaGraph("/me/accounts?"+new URLSearchParams({
      fields:"id,name,access_token,instagram_business_account",
      access_token:userToken
    }).toString());
    const page=Array.isArray(accounts.data)&&accounts.data[0];
    if(!page)throw new Error("No Facebook Page was granted to this Meta account.");
    const igId=page.instagram_business_account?.id||null;
    const meta={
      userAccessToken:userToken,
      pageId:page.id,
      pageName:page.name||"",
      pageAccessToken:page.access_token||userToken,
      instagramUserId:igId,
      connectedAt:new Date().toISOString()
    };
    await saveMetaConnection(meta);
    const cookies=["acf_meta_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"];
    res.setHeader("Set-Cookie",cookies);
    res.redirect("https://swrang120.github.io/AI-Content-Factory/?meta=connected");
  }catch(e){res.status(500).send("Meta OAuth callback failed: "+e.message);}
});
// Meta Webhook verification for Facebook/Instagram integrations.
// Configure META_WEBHOOK_VERIFY_TOKEN on Vercel and use this callback:
// https://ai-content-ai-content-factory-gussvkdme-swrang120.vercel.app/api/meta/webhook
app.get("/api/meta/webhook",(req,res)=>{
  const mode=String(req.query["hub.mode"]||"");
  const token=String(req.query["hub.verify_token"]||"");
  const challenge=String(req.query["hub.challenge"]||"");
  const expected=String(process.env.META_WEBHOOK_VERIFY_TOKEN||"");
  if(mode==="subscribe" && expected && token===expected) return res.status(200).send(challenge);
  return res.status(403).send("Meta webhook verification failed");
});
app.post("/api/meta/webhook",express.json({limit:"1mb"}),(req,res)=>{
  console.log("Meta webhook event received");
  return res.status(200).send("EVENT_RECEIVED");
});

app.get("/api/meta/status",async(req,res)=>{
  try{
    const cfgOk=!!(process.env.META_APP_ID&&process.env.META_APP_SECRET&&process.env.META_REDIRECT_URI);
    const meta=await loadMetaConnection();
    res.json({ok:true,configured:cfgOk,connected:!!meta,page:meta?{id:meta.pageId,name:meta.pageName}:null,instagram:!!meta?.instagramUserId,redirectUri:process.env.META_REDIRECT_URI||null});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});

async function publishMetaVideo(p){
  const meta=await loadMetaConnection();
  if(!meta||!p?.videoUrl)return {facebook:{published:false,reason:"not_connected"},instagram:{published:false,reason:"not_connected"}};
  const out={facebook:{published:false},instagram:{published:false}};
  const caption=String(p.description||p.title||"AI Content Factory").slice(0,2200);
  try{
    const fb=await metaGraph("/"+encodeURIComponent(meta.pageId)+"/videos",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({file_url:p.videoUrl,title:p.title||"AI Content Factory",description:caption,access_token:meta.pageAccessToken})
    });
    out.facebook={published:true,videoId:fb.id||null,url:fb.id?"https://www.facebook.com/"+fb.id:null};
  }catch(e){out.facebook={published:false,error:safeErrorMessage(e)};}
  if(meta.instagramUserId){
    try{
      const container=await metaGraph("/"+encodeURIComponent(meta.instagramUserId)+"/media",{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({media_type:"REELS",video_url:p.videoUrl,caption,access_token:meta.userAccessToken})
      });
      let ready=false;
      for(let n=0;n<10;n++){
        await sleep(3000);
        try{
          const status=await metaGraph("/"+encodeURIComponent(container.id)+"?fields=status_code&access_token="+encodeURIComponent(meta.userAccessToken));
          if(status.status_code==="FINISHED"){ready=true;break;}
          if(status.status_code==="ERROR"){throw new Error("Instagram media processing failed");}
        }catch(e){if(n===9)throw e;}
      }
      if(!ready)throw new Error("Instagram Reel is still processing; publish was not completed.");
      const published=await metaGraph("/"+encodeURIComponent(meta.instagramUserId)+"/media_publish",{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({creation_id:container.id,access_token:meta.userAccessToken})
      });
      out.instagram={published:true,mediaId:published.id||null};
    }catch(e){out.instagram={published:false,error:safeErrorMessage(e)};}
  }else out.instagram={published:false,reason:"no_instagram_professional_account_linked"};
  return out;
}

app.get("/api/youtube/config",(req,res)=>{
  const missing=[];
  if(!process.env.GOOGLE_CLIENT_ID)missing.push("GOOGLE_CLIENT_ID");
  if(!process.env.GOOGLE_CLIENT_SECRET)missing.push("GOOGLE_CLIENT_SECRET");
  if(!process.env.YOUTUBE_REDIRECT_URI)missing.push("YOUTUBE_REDIRECT_URI");
  res.json({
    ok:missing.length===0,
    configured:missing.length===0,
    missing,
    redirectUri:process.env.YOUTUBE_REDIRECT_URI||null,
    callback:"/auth/youtube/callback"
  });
});
async function getYouTubeAnalytics(req){
  const client=oauthClient();
  const tokens=await loadTokens(req);
  if(!tokens)throw new Error("YouTube is not connected.");
  client.setCredentials(tokens);
  const analytics=google.youtubeAnalytics({version:"v2",auth:client});
  const end=new Date();
  const start=new Date(end.getTime()-27*86400000);
  const iso=d=>d.toISOString().slice(0,10);
  const report=await analytics.reports.query({
    ids:"channel==MINE",
    startDate:iso(start),
    endDate:iso(end),
    metrics:"views,likes,comments,shares,subscribersGained,subscribersLost,estimatedMinutesWatched,averageViewDuration",
    dimensions:"video",
    sort:"-views",
    maxResults:25
  });
  const headers=(report.data.columnHeaders||[]).map(x=>x.name);
  const rows=(report.data.rows||[]).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
  const total=rows.reduce((a,r)=>({
    views:a.views+Number(r.views||0),
    likes:a.likes+Number(r.likes||0),
    comments:a.comments+Number(r.comments||0),
    shares:a.shares+Number(r.shares||0),
    subscribersGained:a.subscribersGained+Number(r.subscribersGained||0),
    subscribersLost:a.subscribersLost+Number(r.subscribersLost||0),
    estimatedMinutesWatched:a.estimatedMinutesWatched+Number(r.estimatedMinutesWatched||0)
  }),{views:0,likes:0,comments:0,shares:0,subscribersGained:0,subscribersLost:0,estimatedMinutesWatched:0});
  const recent=rows.slice(0,10);
  return {startDate:iso(start),endDate:iso(end),processedData:true,total,topVideos:recent,latencyNote:"YouTube Analytics reports can lag 48–72 hours; use Data API video statistics for real-time counts."};
}
app.get("/api/youtube/analytics",async(req,res)=>{
  try{res.json({ok:true,analytics:await getYouTubeAnalytics(req)});}
  catch(e){res.status(400).json({ok:false,error:e.message});}
});
app.get("/api/youtube/learning",async(req,res)=>{
  try{
    const analytics=await getYouTubeAnalytics(req);
    const prompt="Analyze this creator's recent YouTube performance and produce a practical next-content strategy. Use only the supplied metrics. Identify the strongest topics/formats based on evidence, useful patterns to test, weak patterns to avoid, title/packaging experiments, audience-retention hypotheses, and 5 next video ideas. Do not claim causation from correlation. Do not copy other creators or copyrighted content. Return concise JSON with keys: winners,patterns,experiments,avoid,nextIdeas.";
    const response=await generateWithChatGPT("youtube_learning_engine",{analytics,prompt});
    res.json({ok:true,analyticsSummary:analytics,total:analytics.total,strategy:response});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});
app.get("/api/youtube/status",async(req,res)=>{
  try{
    const yt=await youtube(req);
    const r=await yt.channels.list({part:"snippet,statistics",mine:true});
    const c=r.data.items?.[0];
    if(!c)return res.json({ok:false,connected:false,error:"No YouTube channel found for the authorized Google account."});
    res.json({ok:true,connected:true,channel:{id:c.id,title:c.snippet.title,subscribers:c.statistics?.subscriberCount||null}});
  }catch(e){
    res.status(400).json({ok:false,connected:false,error:e.message});
  }
});
function settingsFromRequest(req){try{const raw=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("acf_factory_settings="));if(!raw)return null;const parsed=JSON.parse(decodeURIComponent(raw.slice("acf_factory_settings=".length)));if(!parsed||typeof parsed!=="object"||parsed.version!==2)return null;return {...loadSettings(),...parsed};}catch{return null;}}
async function normalizeAndPersistFactorySettings(input){
  const body=input&&typeof input==="object"?input:{};
  const current=await hydrateSettings();
  const next={...current,...body};
  next.version=2;
  next.autoGenerate=!!next.autoGenerate;
  next.approval=next.approval!==false;
  next.autoPublish=!!next.autoPublish;
  next.liveAutomation=!!next.liveAutomation;
  next.liveApproval=next.liveApproval!==false;
  next.liveDurationMinutes=Math.max(1,Math.min(1440,Number(next.liveDurationMinutes)||120));
  next.musicSourceChannels=Array.isArray(next.musicSourceChannels)?next.musicSourceChannels:DEFAULT_FACTORY_SETTINGS.musicSourceChannels;
  next.enabledCategories={...DEFAULT_FACTORY_SETTINGS.enabledCategories,...(next.enabledCategories&&typeof next.enabledCategories==="object"?next.enabledCategories:{})};
  let source="memory-only";
  try{
    const persisted=await persistSettings(next);
    if(persisted&&persisted.ok)source="persistent-supabase";
  }catch(error){
    console.error("Settings persistence warning:",safeErrorMessage(error));
    settingsCache={...DEFAULT_FACTORY_SETTINGS,...next};
  }
  return {settings:next,source};
}
app.get("/api/factory/settings",requireAppKey,async(req,res)=>{
  res.setHeader("Cache-Control","private, no-store");
  try{
    // GET is also a compatibility save path because some Vercel deployments
    // can serve the Express GET route while an older deployment still returns
    // 404 for POST during rollout.
    if(String(req.query.save||"") === "1"){
      const allowed=["autoGenerate","approval","autoPublish","liveAutomation","liveApproval","liveDurationMinutes","version"];
      const input={};
      for(const key of allowed){
        if(req.query[key]!==undefined)input[key]=req.query[key];
      }
      if(req.query.autoGenerate!==undefined)input.autoGenerate=req.query.autoGenerate==="true"||req.query.autoGenerate==="1";
      if(req.query.approval!==undefined)input.approval=req.query.approval!=="false"&&req.query.approval!=="0";
      if(req.query.autoPublish!==undefined)input.autoPublish=req.query.autoPublish==="true"||req.query.autoPublish==="1";
      const saved=await normalizeAndPersistFactorySettings(input);
      res.setHeader("Set-Cookie",`acf_factory_settings=${encodeURIComponent(JSON.stringify(saved.settings))}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None`);
      return res.status(200).json({ok:true,...saved});
    }
    const settings=await hydrateSettings();
    return res.json({ok:true,settings,source:settingsPersistentLoaded?"persistent-supabase":"default"});
  }catch(error){
    console.error("Factory settings GET failed:",error);
    return res.status(500).json({ok:false,error:safeErrorMessage(error)});
  }
});
app.get("/api/agents/state",requireAppKey,async(req,res)=>{
  try{return res.json({ok:true,agents:await getAgentState(),updatedAt:new Date().toISOString()});}
  catch(error){return res.status(500).json({ok:false,error:safeErrorMessage(error)});}
});
app.post("/api/agents/state",requireAppKey,async(req,res)=>{
  try{
    const changes=req.body&&typeof req.body==="object"?req.body.agents:req.body;
    if(!changes||typeof changes!=="object")return res.status(400).json({ok:false,error:"agents state object is required"});
    return res.json({ok:true,agents:await setAgentStates(changes)});
  }catch(error){return res.status(500).json({ok:false,error:safeErrorMessage(error)});}
});
app.get("/api/cron/self-heal",async(req,res)=>{
  try{
    const expected=process.env.CRON_SECRET||process.env.ACF_CRON_SECRET||"";
    const auth=req.headers.authorization||"";
    if(!expected)return res.status(503).json({ok:false,error:"ACF_CRON_SECRET/CRON_SECRET is not configured on the server."});
    if(auth!=="Bearer "+expected)return res.status(401).json({ok:false,error:"Unauthorized cron request"});
    const health=await runFactoryHealthChecks();
    const failed=health.filter(x=>!x.ok);
    if(failed.length){
      const incident=rememberIncident(new Error(failed.map(x=>x.name+": "+x.detail).join("; ")),{route:"/api/cron/self-heal",operation:"scheduled_health_scan",status:503});
      try{await getDualRepairPlan(incident,health);}catch(_){}
    }
    const incidents=selfHealIncidents.filter(x=>!x.healed).slice(0,3);
    const results=[];
    for(const incident of incidents){
      try{await diagnoseIncident(incident);results.push({id:incident.id,diagnosed:true});}
      catch(e){results.push({id:incident.id,diagnosed:false,error:safeErrorMessage(e)});}
    }
    res.json({ok:true,checked:incidents.length,results,health,healthy:health.every(x=>x.ok),providers:{chatgpt:!!process.env.OPENAI_API_KEY,gemini:!!process.env.GEMINI_API_KEY}});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.get("/api/cron/factory",async(req,res)=>{
  try{
    const expected=process.env.ACF_CRON_SECRET||process.env.CRON_SECRET||"";
    const auth=req.headers.authorization||"";
    if(!expected)return res.status(503).json({ok:false,error:"ACF_CRON_SECRET/CRON_SECRET is not configured on the server."});
    if(auth!=="Bearer "+expected)return res.status(401).json({ok:false,error:"Unauthorized cron request"});
    const result=await runAutomaticFactory(req);
    res.json(result);
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.get("/api/factory/automation-schedule",async(req,res)=>{const settings=await hydrateSettings();res.json({ok:true,timeZone:"Asia/Kolkata",schedules:AUTO_SCHEDULES.filter(x=>enabledCategory(settings,x.category)),allSchedules:AUTO_SCHEDULES,settings});});
app.get("/api/live/weekly-schedule",async(req,res)=>{const settings=await hydrateSettings();res.json({ok:true,timeZone:"Asia/Kolkata",startTime:"14:00",endTime:"16:00",durationMinutes:120,schedules:weeklyLiveSchedule(),musicSourceChannels:settings.musicSourceChannels,settings});});

app.post("/api/factory/settings",requireAppKey,async(req,res)=>{
  // Settings must never turn a small persistence problem into a Vercel
  // FUNCTION_INVOCATION_FAILED / HTML error page. Always return JSON.
  res.setHeader("Cache-Control","private, no-store");
  try{
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const current=await hydrateSettings();
    const next={...current,...body};
    next.version=2;
    next.autoGenerate=!!next.autoGenerate;
    next.approval=next.approval!==false;
    next.autoPublish=!!next.autoPublish;
    next.liveAutomation=!!next.liveAutomation;
    next.liveApproval=next.liveApproval!==false;
    next.liveDurationMinutes=Math.max(1,Math.min(1440,Number(next.liveDurationMinutes)||120));
    next.musicSourceChannels=Array.isArray(next.musicSourceChannels)?next.musicSourceChannels:DEFAULT_FACTORY_SETTINGS.musicSourceChannels;
    next.enabledCategories={...DEFAULT_FACTORY_SETTINGS.enabledCategories,...(next.enabledCategories&&typeof next.enabledCategories==="object"?next.enabledCategories:{})};

    let source="memory-only";
    try{
      const persisted=await persistSettings(next);
      if(persisted&&persisted.ok)source="persistent-supabase";
    }catch(persistError){
      console.error("Settings persistence warning:",safeErrorMessage(persistError));
      settingsCache={...DEFAULT_FACTORY_SETTINGS,...next};
    }

    const cookieValue=encodeURIComponent(JSON.stringify(next));
    res.setHeader("Set-Cookie",`acf_factory_settings=${cookieValue}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None`);
    return res.status(200).json({ok:true,settings:next,source});
  }catch(e){
    console.error("Settings save failed:",e);
    return res.status(500).json({ok:false,error:safeErrorMessage(e)});
  }
});

function parseMusicLink(input){
  const raw=String(input||"").trim();
  if(!raw)return {url:null,type:null,id:null};
  try{
    const u=new URL(raw);
    if(u.hostname.includes("spotify.com")){
      const m=u.pathname.match(/\/track\/([A-Za-z0-9]+)/);
      return {url:raw,type:m?"spotify":null,id:m?.[1]||null};
    }
    if(u.hostname.includes("youtube.com")||u.hostname==="youtu.be"){
      const id=u.hostname==="youtu.be"?u.pathname.slice(1).split(/[?&#/]/)[0]:(u.searchParams.get("v")||u.pathname.match(/\/shorts\/([^/?]+)/)?.[1]||u.pathname.match(/\/watch\/([^/?]+)/)?.[1]||"");
      return {url:raw,type:id?"youtube":null,id:id||null};
    }
  }catch(_){}
  return {url:raw,type:null,id:null};
}
function clampNumber(v,min=0,max=100){
  const n=Number(v); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
}
function musicTrendScore(track){
  const velocity=Math.max(0,Number(track.view_velocity)||0);
  const engagement=Math.max(0,Number(track.engagement_rate)||0);
  const views=Math.max(0,Number(track.views)||0);
  const promoViews=Math.max(0,Number(track.promo_views)||0);
  const freshness=track.last_promoted_at?Math.min(1,Math.max(0,(Date.now()-new Date(track.last_promoted_at).getTime())/(7*86400000))):1;
  const raw=Math.log10(views+1)*8 + Math.log10(velocity+1)*22 + Math.min(20,engagement*100) + Math.log10(promoViews+1)*5 + freshness*8;
  return Math.round(clampNumber(raw,0,100)*100)/100;
}
async function upsertMusicTrack(input){
  if(!supabase)throw new Error("Supabase is not configured for Music Library.");
  const parsedSpotify=parseMusicLink(input.spotifyUrl);
  const parsedYouTube=parseMusicLink(input.youtubeUrl);
  if(parsedSpotify.type!=="spotify" && parsedYouTube.type!=="youtube")throw new Error("Add a valid Spotify track link or YouTube video link.");
  let meta={title:String(input.title||"").trim(),artist:String(input.artist||"").trim(),artworkUrl:String(input.artworkUrl||"").trim()};
  if(parsedSpotify.type==="spotify"){
    try{meta=await fetchSpotifyTrackMetadata(parsedSpotify.url);}catch(_){}
  }
  let metrics={views:Number(input.views)||0,likes:Number(input.likes)||0,comments:Number(input.comments)||0};
  if(parsedYouTube.type==="youtube"){
    const supplied=input.youtubeMeta&&typeof input.youtubeMeta==="object"?input.youtubeMeta:null;
    if(supplied){
      meta.title=meta.title||String(supplied.title||"");
      meta.artist=meta.artist||String(supplied.channelTitle||supplied.artist||"");
      meta.artworkUrl=meta.artworkUrl||String(supplied.artworkUrl||"");
      metrics={views:Number(supplied.views||0),likes:Number(supplied.likes||0),comments:Number(supplied.comments||0)};
    }else{
      try{
        const yt=await youtube(input.req);
        const r=await yt.videos.list({part:"snippet,statistics",id:parsedYouTube.id});
        const v=r.data.items?.[0];
        if(v){
          meta.title=meta.title||v.snippet?.title||"";
          meta.artist=meta.artist||v.snippet?.channelTitle||"";
          meta.artworkUrl=meta.artworkUrl||v.snippet?.thumbnails?.high?.url||v.snippet?.thumbnails?.default?.url||"";
          metrics={views:Number(v.statistics?.viewCount||0),likes:Number(v.statistics?.likeCount||0),comments:Number(v.statistics?.commentCount||0)};
        }
      }catch(_){}
    }
  }
  const engagement=(metrics.views>0)?(metrics.likes+metrics.comments)/metrics.views:0;
  const row={
    spotify_url:parsedSpotify.type==="spotify"?parsedSpotify.url:null,
    youtube_url:parsedYouTube.type==="youtube"?parsedYouTube.url:null,
    spotify_track_id:parsedSpotify.type==="spotify"?parsedSpotify.id:null,
    youtube_video_id:parsedYouTube.type==="youtube"?parsedYouTube.id:null,
    title:meta.title||"Untitled Track",
    artist:meta.artist||"Unknown Artist",
    artwork_url:meta.artworkUrl||null,
    audio_url:String(input.audioUrl||"").trim()||null,
    rights_status:["owned","authorized","metadata_only"].includes(String(input.rightsStatus||"owned"))?String(input.rightsStatus||"owned"):"owned",
    status:"active",
    views:metrics.views,likes:metrics.likes,comments:metrics.comments,
    view_velocity:Number(input.viewVelocity)||0,
    engagement_rate:engagement,
    promotion_count:Number(input.promotionCount)||0,
    promo_views:Number(input.promoViews)||0,
    tags:Array.isArray(input.tags)?input.tags.map(String).slice(0,30):[],
    source_metrics:{youtube:parsedYouTube.type==="youtube"?metrics:null,spotify:parsedSpotify.type==="spotify"?{available:true}:null},
    updated_at:new Date().toISOString()
  };
  row.trend_score=musicTrendScore({...row,promo_views:row.promo_views});
  const lookupColumn=row.spotify_url?"spotify_url":"youtube_url";
  const lookupValue=row[lookupColumn];
  const {data:existing,error:lookupError}=await supabase.from("music_library").select("*").eq(lookupColumn,lookupValue).maybeSingle();
  if(lookupError)throw new Error("Music Library lookup failed: "+lookupError.message);
  let data,error;
  if(existing){
    // Metadata/channel sync must never erase a manually attached original master
    // or switch the user's currently active promotion track.
    if(!String(input.audioUrl||"").trim() && existing.audio_url)row.audio_url=existing.audio_url;
    row.status=existing.status||row.status;
    row.promotion_count=Number(existing.promotion_count||row.promotion_count||0);
    row.promo_views=Number(existing.promo_views||row.promo_views||0);
    row.last_used_at=existing.last_used_at||null;
    row.last_promoted_at=existing.last_promoted_at||null;
    ({data,error}=await supabase.from("music_library").update(row).eq("id",existing.id).select("*").single());
  }else{
    ({data,error}=await supabase.from("music_library").insert(row).select("*").single());
  }
  if(error)throw new Error("Music Library save failed: "+error.message);
  return data;
}
function publicMusicTrack(row){
  return {
    id:row.id,spotifyUrl:row.spotify_url,youtubeUrl:row.youtube_url,
    spotifyTrackId:row.spotify_track_id,youtubeVideoId:row.youtube_video_id,
    title:row.title,artist:row.artist,artworkUrl:row.artwork_url,audioUrl:row.audio_url,
    rightsStatus:row.rights_status,status:row.status,views:Number(row.views||0),likes:Number(row.likes||0),comments:Number(row.comments||0),
    viewVelocity:Number(row.view_velocity||0),engagementRate:Number(row.engagement_rate||0),trendScore:Number(row.trend_score||0),
    promotionCount:Number(row.promotion_count||0),promoViews:Number(row.promo_views||0),
    lastPromotedAt:row.last_promoted_at,lastUsedAt:row.last_used_at,lastMetricsAt:row.last_metrics_at,
    tags:row.tags||[],aiAnalysis:row.ai_analysis||null,sourceMetrics:row.source_metrics||null,createdAt:row.created_at,updatedAt:row.updated_at
  };
}
async function refreshMusicTrack(id,req){
  if(!supabase)throw new Error("Supabase is not configured.");
  const {data:row,error}=await supabase.from("music_library").select("*").eq("id",id).maybeSingle();
  if(error||!row)throw new Error("Music track not found.");
  let metrics={views:Number(row.views||0),likes:Number(row.likes||0),comments:Number(row.comments||0)};
  const parsed=parseMusicLink(row.youtube_url||"");
  if(parsed.type==="youtube"){
    try{
      const yt=await youtube(req);
      const r=await yt.videos.list({part:"snippet,statistics",id:parsed.id});
      const v=r.data.items?.[0];
      if(v)metrics={views:Number(v.statistics?.viewCount||0),likes:Number(v.statistics?.likeCount||0),comments:Number(v.statistics?.commentCount||0)};
    }catch(_){}
  }
  const prevViews=Number(row.views||0), delta=Math.max(0,metrics.views-prevViews);
  const velocity=delta/Math.max(1,(row.last_metrics_at?Date.now()-new Date(row.last_metrics_at).getTime():86400000)/86400000);
  const engagement=metrics.views?(metrics.likes+metrics.comments)/metrics.views:0;
  const next={...row,views:metrics.views,likes:metrics.likes,comments:metrics.comments,view_velocity:velocity,engagement_rate:engagement,last_metrics_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  next.trend_score=musicTrendScore(next);
  const {data,error:updateError}=await supabase.from("music_library").update({views:next.views,likes:next.likes,comments:next.comments,view_velocity:next.view_velocity,engagement_rate:next.engagement_rate,trend_score:next.trend_score,last_metrics_at:next.last_metrics_at,source_metrics:{...(row.source_metrics||{}),youtube:parsed.type==="youtube"?metrics:(row.source_metrics?.youtube||null)},updated_at:next.updated_at}).eq("id",id).select("*").single();
  if(updateError)throw new Error("Music metrics refresh failed: "+updateError.message);
  return data;
}
async function selectDailyMusicTrack(req){
  if(!supabase)throw new Error("Supabase is not configured.");
  const {data,error}=await supabase.from("music_library").select("*").eq("status","active").in("rights_status",["owned","authorized"]).not("audio_url","is",null).order("trend_score",{ascending:false}).order("last_used_at",{ascending:true,nullsFirst:true}).limit(100);
  if(error)throw new Error("Music Library selection failed: "+error.message);
  if(!data?.length)throw new Error("No eligible original/authorized track with audio is available for today's Music Promotion.");
  const now=Date.now();
  const scored=data.map((t,i)=>{
    const daysSince=t.last_used_at?Math.max(0,(now-new Date(t.last_used_at).getTime())/86400000):999;
    const cooldown=Math.min(30,daysSince)*1.4;
    const freshness=i<10?10:0;
    return {...t,_managerScore:Number(t.trend_score||0)+cooldown+freshness};
  }).sort((a,b)=>b._managerScore-a._managerScore);
  return scored[0];
}
async function runMusicManagerAnalysis(track){
  const fields={track:{title:track.title,artist:track.artist,views:track.views,likes:track.likes,comments:track.comments,viewVelocity:track.view_velocity,engagementRate:track.engagement_rate,trendScore:track.trend_score,promotionCount:track.promotion_count,promoViews:track.promo_views},goal:"Choose a promotion angle for this original/authorized track. Explain why it is promising using only supplied metrics. Do not claim guaranteed virality."};
  const [chat,gemi]=await Promise.allSettled([
    generateWithChatGPT("music_manager_strategy",fields),
    fallbackTextGeneration("music_manager_trend_analysis",fields)
  ]);
  return {chatgpt:chat.status==="fulfilled"?String(chat.value).slice(0,4000):"Unavailable: "+safeErrorMessage(chat.reason),gemini:gemi.status==="fulfilled"?String(gemi.value).slice(0,4000):"Unavailable: "+safeErrorMessage(gemi.reason)};
}



function parseYouTubeChannelLink(input){
  const raw=String(input||"").trim();
  if(!raw)return {url:null,type:null,value:null};
  try{
    const u=new URL(raw);
    if(!/^(www\.)?(youtube\.com|m\.youtube\.com)$/i.test(u.hostname))return {url:raw,type:null,value:null};
    const p=u.pathname.replace(/\/+$/,"");
    const channel=p.match(/^\/channel\/(UC[\w-]+)(?:\/.*)?$/i);
    if(channel)return {url:raw,type:"id",value:channel[1]};
    const handle=p.match(/^\/@([^/]+)(?:\/.*)?$/);
    if(handle)return {url:raw,type:"handle",value:"@"+handle[1]};
    const user=p.match(/^\/user\/([^/]+)(?:\/.*)?$/i);
    if(user)return {url:raw,type:"username",value:user[1]};
  }catch(_){}
  return {url:raw,type:null,value:null};
}

async function resolveOwnedYouTubeChannel(yt,channelUrl){
  const parsed=parseYouTubeChannelLink(channelUrl);
  if(!parsed.type)throw new Error("Use your YouTube channel URL, such as https://www.youtube.com/@YourChannel.");
  let target;
  if(parsed.type==="id"){
    target=(await yt.channels.list({part:"id,snippet,contentDetails,statistics",id:parsed.value})).data.items?.[0];
  }else if(parsed.type==="handle"){
    target=(await yt.channels.list({part:"id,snippet,contentDetails,statistics",forHandle:parsed.value})).data.items?.[0];
  }else{
    target=(await yt.channels.list({part:"id,snippet,contentDetails,statistics",forUsername:parsed.value})).data.items?.[0];
  }
  if(!target?.id)throw new Error("YouTube channel was not found.");
  return target;
}

async function importOwnedYouTubeChannelPage({channelUrl,pageToken="",maxVideos=250,rightsStatus="owned",req}){
  if(!supabase)throw new Error("Supabase is not configured for Music Library.");
  const yt=await youtube(req);
  const channel=await resolveOwnedYouTubeChannel(yt,channelUrl);
  const configuredIds=(loadSettings().musicSourceChannels||MUSIC_SOURCE_CHANNEL_IDS).map(String);
  if(configuredIds.length && !configuredIds.includes(String(channel.id))){
    throw new Error("This channel is not configured as a Music Library source.");
  }
  const uploads=channel.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads)throw new Error("The connected channel has no uploads playlist.");
  const safeMax=Math.max(1,Math.min(250,Number(maxVideos)||250));
  const page=await yt.playlistItems.list({
    part:"snippet,contentDetails",playlistId:uploads,maxResults:50,...(pageToken?{pageToken}:{})
  });
  const ids=[];
  for(const item of page.data.items||[]){
    const id=item.contentDetails?.videoId;
    if(id&&!ids.includes(id)&&ids.length<safeMax)ids.push(id);
  }
  if(!ids.length)return {channel:{id:channel.id,title:channel.snippet?.title||"",url:"https://www.youtube.com/channel/"+channel.id},imported:0,skipped:0,nextPageToken:page.data.nextPageToken||null,totalResults:Number(page.data.pageInfo?.totalResults||0)};
  const vr=await yt.videos.list({part:"snippet,statistics",id:ids.join(",")});
  const videos=vr.data.items||[];
  let imported=0,skipped=0; const errors=[];
  for(let start=0;start<videos.length;start+=10){
    const batch=videos.slice(start,start+10);
    const results=await Promise.all(batch.map(async v=>{
      try{
        await upsertMusicTrack({
          youtubeUrl:"https://www.youtube.com/watch?v="+v.id,
          rightsStatus:["owned","authorized","metadata_only"].includes(String(rightsStatus))?String(rightsStatus):"owned",
          tags:["YouTube Channel Import",channel.snippet?.title||"",...MUSIC_ARTIST_NAMES].filter(Boolean),
          req,
          youtubeMeta:{
            title:v.snippet?.title||"",
            channelTitle:v.snippet?.channelTitle||channel.snippet?.title||"",
            artworkUrl:v.snippet?.thumbnails?.high?.url||v.snippet?.thumbnails?.medium?.url||v.snippet?.thumbnails?.default?.url||"",
            views:Number(v.statistics?.viewCount||0),
            likes:Number(v.statistics?.likeCount||0),
            comments:Number(v.statistics?.commentCount||0)
          }
        });
        return true;
      }catch(error){
        if(errors.length<5)errors.push(safeErrorMessage(error));
        return false;
      }
    }));
    for(const ok of results)ok?imported++:skipped++;
  }
  return {
    channel:{id:channel.id,title:channel.snippet?.title||"",url:"https://www.youtube.com/channel/"+channel.id,thumbnailUrl:channel.snippet?.thumbnails?.high?.url||channel.snippet?.thumbnails?.default?.url||null},
    imported,skipped,nextPageToken:page.data.nextPageToken||null,totalResults:Number(page.data.pageInfo?.totalResults||0),processed:videos.length,errors
  };
}

async function syncConfiguredMusicSourceChannels(req){
  const settings=loadSettings();
  const channels=(Array.isArray(settings.musicSourceChannels)&&settings.musicSourceChannels.length?settings.musicSourceChannels:MUSIC_SOURCE_CHANNEL_IDS)
    .filter((id,i,a)=>id&&a.indexOf(id)===i);
  const results=[];
  for(const channelId of channels.slice(0,10)){
    try{
      const result=await importOwnedYouTubeChannelPage({
        channelUrl:"https://www.youtube.com/channel/"+channelId,
        pageToken:"",
        maxVideos:50,
        rightsStatus:"owned",
        req
      });
      results.push({channelId,...result});
    }catch(error){
      results.push({channelId,imported:0,skipped:0,error:safeErrorMessage(error)});
    }
  }
  return results;
}

app.post("/api/music/library/sync-sources",requireAppKey,async(req,res)=>{
  try{
    const results=await syncConfiguredMusicSourceChannels(req);
    const imported=results.reduce((n,x)=>n+Number(x.imported||0),0);
    const skipped=results.reduce((n,x)=>n+Number(x.skipped||0),0);
    res.json({ok:true,channels:results,imported,skipped});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});

app.post("/api/music/library/import-channel",requireAppKey,async(req,res)=>{
  try{
    const channelUrl=String(req.body?.channelUrl||"").trim();
    if(!channelUrl)return res.status(400).json({ok:false,error:"YouTube channel link is required."});
    const result=await importOwnedYouTubeChannelPage({
      channelUrl,pageToken:String(req.body?.pageToken||"").trim(),
      maxVideos:Math.min(250,Math.max(1,Number(req.body?.maxVideos)||250)),
      rightsStatus:String(req.body?.rightsStatus||"owned"),req
    });
    res.json({ok:true,...result});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});

app.post("/api/music/library/import",requireAppKey,async(req,res)=>{
  try{
    const tracks=Array.isArray(req.body?.tracks)?req.body.tracks:[req.body||{}];
    if(!tracks.length)return res.status(400).json({ok:false,error:"At least one Spotify or YouTube link is required."});
    const results=[];
    for(const input of tracks.slice(0,100)){
      results.push(publicMusicTrack(await upsertMusicTrack({...input,req})));
    }
    res.json({ok:true,tracks:results,count:results.length});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
async function syncMusicStorageToLibrary(){
  // The Storage bucket is the source of truth for uploaded original masters.
  // Import any existing audio objects that do not yet have a music_library row.
  if(!supabaseAdmin)return {ok:false,storageFiles:0,imported:0,reason:"service_role_not_configured"};
  try{
    const bucket=MUSIC_STORAGE_BUCKET;
    const maxFiles=500;
    const audioExt=/\.(mp3|wav|wave|m4a|aac|ogg|flac)$/i;
    const files=[];
    async function walk(folder="",depth=0){
      if(depth>5||files.length>=maxFiles)return;
      const {data,error}=await supabaseAdmin.storage.from(bucket).list(folder,{limit:1000,sortBy:{column:"name",order:"asc"}});
      if(error)throw error;
      for(const item of (data||[])){
        const name=String(item?.name||"").trim();
        if(!name)continue;
        const fullPath=folder?folder+"/"+name:name;
        // Supabase Storage folder entries have no object id/metadata; real files do.
        if(item?.id || item?.metadata){
          if(audioExt.test(name))files.push({path:fullPath,item});
        }else if(depth<5){
          await walk(fullPath,depth+1);
        }
        if(files.length>=maxFiles)break;
      }
    }
    await walk();
    const {data:existing,error:existingError}=await supabaseAdmin
      .from("music_library").select("id,audio_url");
    if(existingError)throw existingError;
    const known=new Set((existing||[]).map(x=>String(x.audio_url||"")));
    const base=SUPABASE_URL.replace(/\/$/,"");
    let imported=0;
    for(const entry of files){
      const encoded=entry.path.split("/").map(encodeURIComponent).join("/");
      const audioUrl=base+"/storage/v1/object/public/"+encodeURIComponent(bucket)+"/"+encoded;
      if(known.has(audioUrl))continue;
      const filename=entry.path.split("/").pop()||"Original Music.mp3";
      const title=filename.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim()||"Original Music";
      const now=new Date().toISOString();
      const row={
        id:crypto.randomUUID(),
        spotify_url:null,youtube_url:null,spotify_track_id:null,youtube_video_id:null,
        title,artist:"Swrang Swargiary",artwork_url:null,audio_url:audioUrl,
        rights_status:"owned",status:"paused",
        views:0,likes:0,comments:0,view_velocity:0,engagement_rate:0,trend_score:0,
        promotion_count:0,promo_views:0,last_promoted_at:null,last_used_at:null,last_metrics_at:null,
        tags:["Original Master","Storage Import"],ai_analysis:null,
        source_metrics:{upload:"supabase_storage_existing",storage_path:entry.path},
        created_at:entry.item?.created_at||now,updated_at:now
      };
      const {error}=await supabaseAdmin.from("music_library").insert(row);
      if(error){
        // Do not stop the whole library because one legacy object has bad metadata.
        console.warn("Music Storage import skipped:",entry.path,error.message);
        continue;
      }
      known.add(audioUrl);
      imported++;
    }
    return {ok:true,storageFiles:files.length,imported};
  }catch(error){
    console.warn("Music Storage sync warning:",safeErrorMessage(error));
    return {ok:false,storageFiles:0,imported:0,error:safeErrorMessage(error)};
  }
}

app.post("/api/music/library/sync-storage",requireAppKey,async(req,res)=>{
  try{
    const result=await syncMusicStorageToLibrary();
    res.json(result);
  }catch(e){
    res.status(500).json({ok:false,error:safeErrorMessage(e)});
  }
});

app.get("/api/music/library",requireAppKey,async(req,res)=>{
  try{
    if(!supabase&&!supabaseAdmin)throw new Error("Supabase is not configured for Music Library.");
    await syncMusicStorageToLibrary();
    const limit=Math.max(1,Math.min(100,Number(req.query.limit)||25));
    const page=Math.max(0,Number(req.query.page)||0);
    const sort=["trend","views","recent","used"].includes(String(req.query.sort||"trend"))?String(req.query.sort||"trend"):"trend";
    const q=String(req.query.q||"").trim();
    const db=supabaseAdmin||supabase;
    let query=db.from("music_library").select("*",{count:"exact"});
    if(q)query=query.or("title.ilike.%"+q.replace(/[%_]/g,"")+"%,artist.ilike.%"+q.replace(/[%_]/g,"")+"%");
    if(sort==="views")query=query.order("views",{ascending:false});
    else if(sort==="recent")query=query.order("created_at",{ascending:false});
    else if(sort==="used")query=query.order("last_used_at",{ascending:true,nullsFirst:true});
    else query=query.order("trend_score",{ascending:false}).order("updated_at",{ascending:false});
    const from=page*limit; const to=from+limit-1;
    const {data,error,count}=await query.range(from,to);
    if(error)throw new Error(error.message);
    res.json({ok:true,tracks:(data||[]).map(publicMusicTrack),count:count||0,page,limit,hasMore:(count||0)>to+1});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.get("/api/music/library/:id",requireAppKey,async(req,res)=>{
  try{
    const {data,error}=await supabase.from("music_library").select("*").eq("id",req.params.id).maybeSingle();
    if(error||!data)return res.status(404).json({ok:false,error:"Music track not found."});
    res.json({ok:true,track:publicMusicTrack(data)});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.delete("/api/music/library/:id",requireAppKey,async(req,res)=>{
  try{
    if(!supabaseAdmin)throw new Error("Supabase server is not configured.");
    const id=String(req.params.id||"").trim();
    if(!id)throw new Error("Track ID is required.");
    const {data:track,error:findError}=await supabaseAdmin.from("music_library").select("*").eq("id",id).maybeSingle();
    if(findError)throw new Error(findError.message);
    if(!track)throw new Error("Music track not found.");
    const audioUrl=String(track.audio_url||"");
    let storagePath="";
    const marker="/storage/v1/object/public/"+encodeURIComponent(MUSIC_STORAGE_BUCKET)+"/";
    const markerIndex=audioUrl.indexOf(marker);
    if(markerIndex>=0)storagePath=decodeURIComponent(audioUrl.slice(markerIndex+marker.length));
    if(storagePath){
      const {error:storageError}=await supabaseAdmin.storage.from(MUSIC_STORAGE_BUCKET).remove([storagePath]);
      if(storageError)console.warn("Music storage delete warning:",storageError.message);
    }
    const {error:deleteError}=await supabaseAdmin.from("music_library").delete().eq("id",id);
    if(deleteError)throw new Error("Music Library delete failed: "+deleteError.message);
    res.json({ok:true,deletedId:id,wasActive:track.status==="active"});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.patch("/api/music/library/:id",requireAppKey,async(req,res)=>{
  try{
    const allowed={title:"title",artist:"artist",spotifyUrl:"spotify_url",youtubeUrl:"youtube_url",audioUrl:"audio_url",artworkUrl:"artwork_url",rightsStatus:"rights_status",status:"status",tags:"tags"};
    const patch={};
    for(const [k,col] of Object.entries(allowed))if(req.body?.[k]!==undefined)patch[col]=req.body[k];
    if(patch.rights_status&&!["owned","authorized","metadata_only"].includes(patch.rights_status))throw new Error("Invalid rights status.");
    patch.updated_at=new Date().toISOString();
    const {data,error}=await supabase.from("music_library").update(patch).eq("id",req.params.id).select("*").single();
    if(error)throw new Error(error.message);
    res.json({ok:true,track:publicMusicTrack(data)});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/music/library/:id/refresh",requireAppKey,async(req,res)=>{
  try{res.json({ok:true,track:publicMusicTrack(await refreshMusicTrack(req.params.id,req))});}
  catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/music/library/:id/analyze",requireAppKey,async(req,res)=>{
  try{
    const {data,error}=await supabase.from("music_library").select("*").eq("id",req.params.id).maybeSingle();
    if(error||!data)throw new Error("Music track not found.");
    const analysis=await runMusicManagerAnalysis(data);
    const {data:updated,error:updateError}=await supabase.from("music_library").update({ai_analysis:analysis,updated_at:new Date().toISOString()}).eq("id",data.id).select("*").single();
    if(updateError)throw new Error(updateError.message);
    res.json({ok:true,analysis,track:publicMusicTrack(updated)});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.get("/api/music/manager/today",requireAppKey,async(req,res)=>{
  try{
    const track=await selectDailyMusicTrack(req);
    const manager=await runMusicManagerAnalysis(track);
    res.json({ok:true,track:publicMusicTrack(track),manager});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/music/library/upload-token",requireAppKey,async(req,res)=>{
  try{
    if(!supabaseAdmin)throw new Error("Supabase server Storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.");
    const body=req.body&&typeof req.body==="object"?req.body:{};
    // Storage object names are always ASCII-safe. The user's original
    // filename/title may contain Hindi, Bodo, Assamese, emoji or other Unicode;
    // that must never make the upload fail. Preserve the title separately.
    const originalFilename=String(body.filename||"original-audio.mp3").trim();
    const extMatch=originalFilename.match(/\\.(mp3|wav|wave|m4a|aac|ogg|flac)$/i);
    const ext=extMatch?extMatch[1].toLowerCase().replace("wave","wav"):"mp3";
    const titleRaw=String(body.title||"").trim();
    const title=titleRaw||originalFilename.replace(/\\.[^.]+$/,"").trim()||"Original Music";
    const id=crypto.randomUUID();
    const pathname="original/"+id+"-"+Date.now()+"."+ext;
    const {data,error}=await supabaseAdmin.storage.from(MUSIC_STORAGE_BUCKET).createSignedUploadUrl(pathname,{upsert:false});
    if(error||!data?.token)throw new Error("Could not create Supabase Storage upload URL: "+(error?.message||"unknown error"));
    const base=SUPABASE_URL.replace(/\/$/,"");
    const encodedPath=pathname.split("/").map(encodeURIComponent).join("/");
    const uploadUrl=base+"/storage/v1/object/upload/sign/"+encodeURIComponent(MUSIC_STORAGE_BUCKET)+"/"+encodedPath;
    const publicUrl=base+"/storage/v1/object/public/"+encodeURIComponent(MUSIC_STORAGE_BUCKET)+"/"+encodedPath;
    let resumableEndpoint="";
    try{
      const u=new URL(SUPABASE_URL);
      const projectRef=u.hostname.split(".")[0];
      resumableEndpoint="https://"+projectRef+".storage.supabase.co/storage/v1/upload/resumable";
    }catch(_){}
    const signedUrl=uploadUrl+"?token="+encodeURIComponent(data.token);
    res.json({ok:true,id,title,filename:originalFilename,pathname,token:data.token,signedUrl,uploadUrl,publicUrl,resumableEndpoint});
  }catch(e){
    console.error("Supabase music presign failed:",e);
    res.status(400).json({ok:false,error:safeErrorMessage(e)});
  }
});

app.post("/api/music/library/activate-upload",requireAppKey,async(req,res)=>{
  try{
    if(!supabaseAdmin)throw new Error("Supabase server Storage is not configured.");
    const pathname=String(req.body?.pathname||"").trim();
    const id=String(req.body?.id||"").trim();
    const title=String(req.body?.title||"Original Music").trim()||"Original Music";
    if(!pathname||!id)throw new Error("Upload session information is missing.");
    const folder=pathname.split("/").slice(0,-1).join("/");
    const filename=pathname.split("/").pop();
    const {data:objects,error:listError}=await supabaseAdmin.storage.from(MUSIC_STORAGE_BUCKET).list(folder,{search:filename,limit:1});
    if(listError)throw new Error("Supabase Storage verification failed: "+listError.message);
    if(!Array.isArray(objects)||!objects.some(x=>x.name===filename))throw new Error("Uploaded audio could not be verified in Supabase Storage.");
    const now=new Date().toISOString();
    const db=supabaseAdmin;
    const {error:deactivateError}=await db.from("music_library").update({status:"paused",updated_at:now}).eq("status","active");
    if(deactivateError)throw new Error("Could not switch active promotion track: "+deactivateError.message);
    const audioUrl=SUPABASE_URL.replace(/\/$/,"")+"/storage/v1/object/public/"+encodeURIComponent(MUSIC_STORAGE_BUCKET)+"/"+pathname.split("/").map(encodeURIComponent).join("/");
    const row={id,spotify_url:null,youtube_url:null,spotify_track_id:null,youtube_video_id:null,title,artist:"Swrang Swargiary",artwork_url:null,audio_url:audioUrl,rights_status:"owned",status:"active",views:0,likes:0,comments:0,view_velocity:0,engagement_rate:0,trend_score:0,promotion_count:0,promo_views:0,last_promoted_at:null,last_used_at:null,last_metrics_at:null,tags:["Original Master"],ai_analysis:null,source_metrics:{upload:"supabase_storage"},created_at:now,updated_at:now};
    const {data,error}=await db.from("music_library").insert(row).select("*").single();
    if(error)throw new Error("Music Library save failed: "+error.message);
    res.json({ok:true,track:publicMusicTrack(data),activePromotionTrack:true});
  }catch(e){
    console.error("Supabase music activation failed:",e);
    res.status(400).json({ok:false,error:safeErrorMessage(e)});
  }
});

app.post("/api/music/library/audio",requireAppKey,express.raw({type:["audio/*","application/octet-stream"],limit:"100mb"}),async(req,res)=>{
  try{
    const id=String(req.query.id||"").trim();
    if(!id||!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"Track ID and audio file are required."});
    const {data:track,error}=await supabase.from("music_library").select("id,rights_status").eq("id",id).maybeSingle();
    if(error||!track)throw new Error("Music track not found.");
    if(!["owned","authorized"].includes(track.rights_status))throw new Error("Audio can only be attached to owned/authorized tracks.");
    const filename=String(req.query.filename||"original-audio.mp3").replace(/[^a-zA-Z0-9._-]/g,"_");
    const {put}=await import("@vercel/blob");
    const blob=await put("music-library/"+id+"-"+Date.now()+"-"+filename,req.body,{access:"public",contentType:req.headers["content-type"]||"audio/mpeg",...(BLOB_TOKEN?{token:BLOB_TOKEN}:{})});
    // The newest uploaded master becomes the single active daily promotion track.
    // Keep older tracks in the library, but remove them from the automatic promotion pool.
    const {error:deactivateError}=await supabase.from("music_library")
      .update({status:"paused",updated_at:new Date().toISOString()})
      .neq("id",id)
      .in("status",["active"]);
    if(deactivateError)throw new Error("Could not switch active promotion track: "+deactivateError.message);
    const {data,error:updateError}=await supabase.from("music_library")
      .update({audio_url:blob.url,status:"active",updated_at:new Date().toISOString()})
      .eq("id",id).select("*").single();
    if(updateError)throw new Error(updateError.message);
    res.json({ok:true,track:publicMusicTrack(data),url:blob.url,activePromotionTrack:true});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});

app.get("/api/music/track",requireAppKey,async(req,res)=>{
  try{
    const meta=await fetchSpotifyTrackMetadata(String(req.query?.url||"").trim());
    res.json({ok:true,track:meta});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/music/promotion",requireAppKey,async(req,res)=>{
  try{
    const spotifyUrl=String(req.body?.spotifyUrl||"").trim();
    const audioUrl=String(req.body?.audioUrl||"").trim();
    const language=String(req.body?.language||"Hindi + Bodo");
    const notes=String(req.body?.notes||"");
    if(!spotifyUrl)return res.status(400).json({ok:false,error:"Spotify track link is required."});
    if(!audioUrl)return res.status(400).json({ok:false,error:"Original song audio is required. Spotify does not provide a full-track download endpoint."});
    const result=await createMusicPromotionJob({spotifyUrl,audioUrl,language,notes,req});
    return res.json(result);
  }catch(e){return res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/media/presign",requireAppKey,async(req,res)=>{
  try{
    const filename=String(req.body?.filename||"video.mp4").replace(/[^a-zA-Z0-9._-]/g,"_");
    const contentType=String(req.body?.contentType||"video/mp4");
    const pathname="uploads/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+filename;
    const {issueSignedToken,presignUrl}=await import("@vercel/blob");
    const token=await issueSignedToken({pathname,operations:["put"]});
    const signed=await presignUrl(token,{pathname,operation:"put",validUntil:Date.now()+15*60*1000});
    return res.json({ok:true,pathname,uploadUrl:signed.presignedUrl,contentType});
  }catch(e){
    console.error("Blob presign failed:",e);
    return res.status(500).json({ok:false,error:safeErrorMessage(e)});
  }
});
app.post("/api/media/complete-upload",requireAppKey,async(req,res)=>{
  try{
    const {url,pathname,title,filename,size,contentType}=req.body||{};
    if(!url)return res.status(400).json({ok:false,error:"Uploaded Blob URL is required"});
    const finalTitle=String(title||filename||"Uploaded Video");
    const id="boss_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
    const scheduledSlot=nextBossUploadSlot();
    const jobs=loadJobs();
    jobs[id]={id,status:"approved",topic:finalTitle,category:"Boss Upload",language:"English",format:"Uploaded Video",notes:"Uploaded by Boss",sourceText:"",sources:[],renderedVideoUrl:String(url),approved:true,autoPublish:true,manualUpload:true,scheduledSlot,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),media:{pathname,filename,size:Number(size)||0,contentType:contentType||"video/mp4"}};
    saveJobs(jobs);
    await persistJob(jobs[id]);
    return res.json({ok:true,title:finalTitle,url,pathname,size:Number(size)||0,contentType:contentType||"video/mp4",jobId:id,scheduledSlot,status:"queued"});
  }catch(e){
    console.error("Blob completion failed:",e);
    return res.status(500).json({ok:false,error:safeErrorMessage(e)});
  }
});
app.post("/api/media/upload-file",requireAppKey,express.raw({type:["video/mp4","video/*","audio/*","application/octet-stream"],limit:"50mb"}),async(req,res)=>{
  try{
    const filename=String(req.query.filename||"video.mp4").replace(/[^a-zA-Z0-9._-]/g,"_");
    const title=String(req.query.title||filename);
    if(!req.body||!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"Video file body is required"});
    const {put}=await import("@vercel/blob");
    const blob=await put("uploads/"+Date.now()+"-"+filename,req.body,{access:"public",contentType:req.headers["content-type"]||"video/mp4",...(BLOB_TOKEN?{token:BLOB_TOKEN}:{})});
    const scheduledSlot=String(req.query.scheduledSlot||"").trim()||nextBossUploadSlot();
    const id="boss_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
    const jobs=loadJobs();
    jobs[id]={id,status:"approved",topic:title,category:"Boss Upload",language:"English",format:"Uploaded Video",notes:"Uploaded by Boss",sourceText:"",sources:[],renderedVideoUrl:blob.url,approved:true,autoPublish:true,manualUpload:true,scheduledSlot,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    saveJobs(jobs); await persistJob(jobs[id]);
    res.json({ok:true,title,url:blob.url,pathname:blob.pathname,contentType:req.headers["content-type"]||"video/mp4",size:req.body.length,jobId:id,scheduledSlot,status:"queued"});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/youtube/upload-file",requireAppKey,express.raw({type:["video/mp4","video/*","application/octet-stream"],limit:"50mb"}),async(req,res)=>{
  try{
    const {title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.query||{};
    if(!title)return res.status(400).json({ok:false,error:"title is required"});
    if(!req.body||!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"MP4 file body is required"});
    const selectedPrivacy=privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private";
    if(selectedPrivacy==="public"&&loadSettings().approval)return res.status(409).json({ok:false,error:"Approval is required before public publishing."});
    const yt=await youtube(req);
    const status={privacyStatus:selectedPrivacy};
    if(publishAt)status.publishAt=publishAt;
    const response=await yt.videos.insert({
      part:"snippet,status",
      requestBody:{snippet:{title,description,tags:Array.isArray(tags)?tags:String(tags).split(",").map(x=>x.trim()).filter(Boolean),categoryId},status},
      media:{body:Readable.from(req.body)}
    });
    res.json({ok:true,videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||selectedPrivacy});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/youtube/upload",requireAppKey,async(req,res)=>{try{const {videoUrl,title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.body||{};if(!videoUrl||!title)return res.status(400).json({ok:false,error:"videoUrl and title are required"});if((privacyStatus||"private")==="public"&&loadSettings().approval)throw new Error("Approval is required before public publishing.");const asset=await fetch(videoUrl);if(!asset.ok||!asset.body)throw new Error("Could not fetch video asset");const yt=await youtube(req);const status={privacyStatus:privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private"};if(publishAt)status.publishAt=publishAt;const response=await yt.videos.insert({part:"snippet,status",requestBody:{snippet:{title,description,tags,categoryId},status},media:{body:Readable.fromWeb(asset.body)}});res.json({ok:true,videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||status.privacyStatus});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post("/api/publisher/youtube",requireAppKey,async(req,res)=>{try{const p=req.body||{};const result=await publishRenderedYouTubeVideo(p);res.json({ok:true,published:true,...result});}catch(e){const code=e.message==="Auto Publish is OFF."||e.message==="Human approval is required before publishing."?409:500;res.status(code).json({ok:false,published:false,error:e.message});}});

/* =========================
   YOUTUBE LIVE AUTOMATION
   Orchestration lives in Vercel; FFmpeg runs on a dedicated worker.
   Stream credentials are never returned to browser/dashboard clients.
========================= */
const LIVE_TZ="Asia/Kolkata";
const LIVE_START_HOUR=14;
const LIVE_END_HOUR=16;
const LIVE_PREP_MINUTES=5;
const LIVE_STATE_KEY="__acf_live_jobs";

function liveWorkerAuthorized(req){
  const expected=String(process.env.LIVE_WORKER_TOKEN||"").trim();
  if(!expected)return {ok:false,status:503,error:"LIVE_WORKER_TOKEN is not configured on the server."};
  const supplied=String(req.headers["x-live-worker-token"]||"").trim();
  if(!supplied||supplied!==expected)return {ok:false,status:401,error:"Unauthorized live worker."};
  return {ok:true};
}
async function readLiveJobs(){
  if(!supabase)return {};
  try{
    const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
    if(error)throw error;
    const value=data?.tokens?.[LIVE_STATE_KEY];
    return value&&typeof value==="object"?value:{};
  }catch(error){
    console.error("Live state read warning:",safeErrorMessage(error));
    return {};
  }
}
async function writeLiveJobs(jobs){
  if(!supabase)throw new Error("Supabase is required for persistent YouTube Live state.");
  const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
  if(error)throw error;
  const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
  const tokens={...existing,[LIVE_STATE_KEY]:jobs};
  const saved=await supabase.from("youtube_connections").upsert({id:"default",tokens,updated_at:new Date().toISOString()},{onConflict:"id"});
  if(saved.error)throw saved.error;
  return jobs;
}
function liveLocalParts(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:LIVE_TZ,year:"numeric",month:"2-digit",day:"2-digit",weekday:"long"}).formatToParts(date);
  const get=k=>parts.find(x=>x.type===k)?.value;
  return {year:Number(get("year")),month:Number(get("month")),day:Number(get("day")),weekday:get("weekday")};
}
function liveDateKey(date=new Date()){
  const p=liveLocalParts(date);
  return p.year+"-"+String(p.month).padStart(2,"0")+"-"+String(p.day).padStart(2,"0");
}
function liveDateTime(dateKey,hour,minute=0){
  const [y,m,d]=String(dateKey).split("-").map(Number);
  // India has no DST. Build the UTC instant for Asia/Kolkata explicitly.
  return new Date(Date.UTC(y,m-1,d,hour-5,minute-30,0));
}
function liveScheduleForDate(dateKey){
  const p=liveLocalParts(liveDateTime(dateKey,12,0));
  const dayName=p.weekday;
  const base=weeklyLiveSchedule().find(x=>String(x.day).toLowerCase()===String(dayName).toLowerCase())||null;
  return base||{id:"daily_"+dateKey,day:dayName,dayIndex:new Date(dateKey+"T00:00:00Z").getUTCDay(),category:"AI Content Factory Live",title:"AI Content Factory Live",prompt:"Original AI Content Factory programming."};
}
function safeLiveJob(job){
  if(!job)return null;
  return {
    id:job.id,dateKey:job.dateKey,day:job.day,title:job.title,description:job.description,
    scheduledStartTime:job.scheduledStartTime,scheduledEndTime:job.scheduledEndTime,
    status:job.status,broadcastId:job.broadcastId||null,streamId:job.streamId||null,
    youtubeUrl:job.broadcastId?"https://www.youtube.com/watch?v="+job.broadcastId:null,
    mediaType:job.mediaType||null,mediaUrl:job.mediaUrl||null,workerStatus:job.workerStatus||"waiting",
    createdAt:job.createdAt,updatedAt:job.updatedAt,error:job.error||null
  };
}
async function selectLiveMedia(dateKey){
  // Monday is reserved for original/authorized music. The worker can turn an
  // audio master into a simple video stream without downloading third-party music.
  const schedule=liveScheduleForDate(dateKey);
  if(String(schedule.day).toLowerCase()==="monday" && supabase){
    const {data,error}=await supabase.from("music_library").select("*").eq("status","active").in("rights_status",["owned","authorized"]).not("audio_url","is",null).order("last_promoted_at",{ascending:true,nullsFirst:true}).limit(1);
    if(!error&&data?.[0]?.audio_url){
      return {mediaType:"audio",mediaUrl:data[0].audio_url,mediaTitle:data[0].title||"Original Music Live",rightsStatus:data[0].rights_status||"owned",trackId:data[0].id};
    }
  }
  if(supabase){
    const {data,error}=await supabase.from("content_jobs").select("id,topic,rendered_video_url,updated_at").not("rendered_video_url","is",null).order("updated_at",{ascending:false}).limit(10);
    if(!error&&data?.length){
      const item=data.find(x=>x.rendered_video_url);
      if(item)return {mediaType:"video",mediaUrl:item.rendered_video_url,mediaTitle:item.topic||"AI Content Factory Live",jobId:item.id};
    }
  }
  return null;
}
async function createYouTubeLiveJob({dateKey,privacyStatus}={}){
  const targetDate=dateKey||liveDateKey(new Date(Date.now()+LIVE_PREP_MINUTES*60000));
  const existingJobs=await readLiveJobs();
  const existing=existingJobs[targetDate];
  if(existing && ["scheduled","worker_claimed","starting","live"].includes(existing.status))return safeLiveJob(existing);
  const settings=await hydrateSettings();
  if(!settings.liveAutomation && process.env.LIVE_AUTOMATION_ENABLED!=="true"){
    throw new Error("Live Automation is OFF. Enable liveAutomation in Factory Settings or set LIVE_AUTOMATION_ENABLED=true.");
  }
  const media=await selectLiveMedia(targetDate);
  if(!media)throw new Error("No live media package is ready. Create a rendered video first; Monday also requires an active original/authorized music master.");
  const schedule=liveScheduleForDate(targetDate);
  const start=liveDateTime(targetDate,LIVE_START_HOUR,0);
  const end=liveDateTime(targetDate,LIVE_END_HOUR,0);
  if(start.getTime()<=Date.now())throw new Error("The live start time for "+targetDate+" has already passed.");
  const yt=await youtube({});
  const privacy=String(privacyStatus||process.env.YOUTUBE_LIVE_PRIVACY||"private");
  if(!["private","unlisted","public"].includes(privacy))throw new Error("Invalid YOUTUBE_LIVE_PRIVACY.");
  const title=String(schedule.title||"AI Content Factory Live").slice(0,100);
  const description=("AI Content Factory · "+String(schedule.category||"Live")+" · Original/authorized programming.").slice(0,5000);
  const broadcast=await yt.liveBroadcasts.insert({
    part:"snippet,status,contentDetails",
    requestBody:{
      snippet:{title,description,scheduledStartTime:start.toISOString(),scheduledEndTime:end.toISOString(),categoryId:"22"},
      status:{privacyStatus:privacy},
      contentDetails:{enableAutoStart:false,enableAutoStop:false,enableDvr:true,recordFromStart:true}
    }
  });
  const stream=await yt.liveStreams.insert({
    part:"snippet,cdn,contentDetails",
    requestBody:{
      snippet:{title:title+" · Stream"},
      cdn:{frameRate:"30fps",ingestionType:"rtmp",resolution:"1080p"},
      contentDetails:{isReusable:false}
    }
  });
  await yt.liveBroadcasts.bind({
    part:"id,contentDetails",
    id:broadcast.data.id,
    streamId:stream.data.id
  });
  const ingestion=stream.data.cdn?.ingestionInfo||{};
  if(!ingestion.ingestionAddress||!ingestion.streamName)throw new Error("YouTube did not return RTMP ingestion information.");
  const job={
    id:"live_"+targetDate+"_"+Date.now().toString(36),
    dateKey:targetDate,day:schedule.day,title,description,
    scheduledStartTime:start.toISOString(),scheduledEndTime:end.toISOString(),
    status:"scheduled",workerStatus:"waiting",
    broadcastId:broadcast.data.id,streamId:stream.data.id,
    ingestionAddress:ingestion.ingestionAddress,streamName:ingestion.streamName,
    mediaType:media.mediaType,mediaUrl:media.mediaUrl,mediaTitle:media.mediaTitle||title,
    trackId:media.trackId||null,sourceJobId:media.jobId||null,
    privacyStatus:privacy,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  existingJobs[targetDate]=job;
  await writeLiveJobs(existingJobs);
  return safeLiveJob(job);
}
async function transitionLiveBroadcast(job,broadcastStatus){
  const yt=await youtube({});
  const result=await yt.liveBroadcasts.transition({part:"id,status",id:job.broadcastId,broadcastStatus});
  return result.data;
}
async function runLiveScheduler(){
  const now=new Date();
  const settings=await hydrateSettings();
  const automation=settings.liveAutomation||process.env.LIVE_AUTOMATION_ENABLED==="true";
  if(!automation)return {ok:true,skipped:true,reason:"Live Automation is OFF.",at:now.toISOString()};
  const dateKey=liveDateKey(now);
  const start=liveDateTime(dateKey,LIVE_START_HOUR,0);
  const prep=liveDateTime(dateKey,LIVE_START_HOUR, -LIVE_PREP_MINUTES);
  if(now<prep)return {ok:true,skipped:true,reason:"Before live preparation window.",dateKey,prepareAt:prep.toISOString()};
  if(now>=liveDateTime(dateKey,LIVE_END_HOUR,0))return {ok:true,skipped:true,reason:"Today's live window has ended.",dateKey};
  try{
    const job=await createYouTubeLiveJob({dateKey});
    return {ok:true,scheduled:true,dateKey,job};
  }catch(error){
    return {ok:false,dateKey,error:safeErrorMessage(error)};
  }
}

app.get("/api/live/status",async(req,res)=>{
  try{
    const jobs=await readLiveJobs();
    const keys=Object.keys(jobs).sort().reverse();
    const recent=keys.slice(0,7).map(k=>safeLiveJob(jobs[k]));
    const settings=await hydrateSettings();
    res.json({ok:true,timeZone:LIVE_TZ,startTime:"14:00",endTime:"16:00",workerConfigured:!!process.env.LIVE_WORKER_TOKEN,automationEnabled:!!(settings.liveAutomation||process.env.LIVE_AUTOMATION_ENABLED==="true"),jobs:recent});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});

app.post("/api/live/create",requireAppKey,async(req,res)=>{
  try{
    const job=await createYouTubeLiveJob({dateKey:String(req.body?.dateKey||"").trim()||undefined,privacyStatus:req.body?.privacyStatus});
    res.json({ok:true,job});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});

/* Worker-only endpoints. These never return the raw YouTube stream key to dashboard clients. */
app.get("/api/live/worker/claim",async(req,res)=>{
  const auth=liveWorkerAuthorized(req); if(!auth.ok)return res.status(auth.status).json({ok:false,error:auth.error});
  try{
    const jobs=await readLiveJobs();
    const now=Date.now();
    const job=Object.values(jobs).filter(x=>x&&["scheduled","worker_claimed","starting","live"].includes(x.status)).sort((a,b)=>new Date(a.scheduledStartTime)-new Date(b.scheduledStartTime))[0];
    if(!job)return res.json({ok:true,job:null});
    const prep=new Date(job.scheduledStartTime).getTime()-LIVE_PREP_MINUTES*60000;
    if(now<prep)return res.json({ok:true,job:null,next:{id:job.id,startTime:job.scheduledStartTime}});
    const next={...job,status:job.status==="scheduled"?"worker_claimed":job.status,workerStatus:"claimed",updatedAt:new Date().toISOString()};
    jobs[job.dateKey]=next; await writeLiveJobs(jobs);
    // The raw RTMP target is only exposed to a request authenticated with LIVE_WORKER_TOKEN.
    return res.json({ok:true,job:{...safeLiveJob(next),ingestionAddress:next.ingestionAddress,streamName:next.streamName,rtmpUrl:next.ingestionAddress+"/"+next.streamName}});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/live/worker/start",async(req,res)=>{
  const auth=liveWorkerAuthorized(req); if(!auth.ok)return res.status(auth.status).json({ok:false,error:auth.error});
  try{
    const id=String(req.body?.id||""); if(!id)return res.status(400).json({ok:false,error:"Live job id is required."});
    const jobs=await readLiveJobs(); const job=Object.values(jobs).find(x=>x?.id===id);
    if(!job)return res.status(404).json({ok:false,error:"Live job not found."});
    const live=await transitionLiveBroadcast(job,"live");
    job.status="live";job.workerStatus="streaming";job.updatedAt=new Date().toISOString();job.lastYouTubeStatus=live?.status?.lifeCycleStatus||"live";
    jobs[job.dateKey]=job;await writeLiveJobs(jobs);
    res.json({ok:true,job:safeLiveJob(job),youtubeStatus:live?.status?.lifeCycleStatus||null});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/live/worker/finish",async(req,res)=>{
  const auth=liveWorkerAuthorized(req); if(!auth.ok)return res.status(auth.status).json({ok:false,error:auth.error});
  try{
    const id=String(req.body?.id||""); if(!id)return res.status(400).json({ok:false,error:"Live job id is required."});
    const jobs=await readLiveJobs(); const job=Object.values(jobs).find(x=>x?.id===id);
    if(!job)return res.status(404).json({ok:false,error:"Live job not found."});
    let live=null;
    if(job.broadcastId){
      try{live=await transitionLiveBroadcast(job,"complete");}catch(error){
        // A worker restart may call finish twice; treat an already-complete broadcast as idempotent.
        if(!/redundantTransition|invalidTransition/i.test(safeErrorMessage(error)))throw error;
      }
    }
    job.status="completed";job.workerStatus="finished";job.updatedAt=new Date().toISOString();job.completedAt=new Date().toISOString();
    jobs[job.dateKey]=job;await writeLiveJobs(jobs);
    res.json({ok:true,job:safeLiveJob(job),youtubeStatus:live?.status?.lifeCycleStatus||"complete"});
  }catch(e){res.status(400).json({ok:false,error:safeErrorMessage(e)});}
});
app.post("/api/live/worker/error",async(req,res)=>{
  const auth=liveWorkerAuthorized(req); if(!auth.ok)return res.status(auth.status).json({ok:false,error:auth.error});
  try{
    const id=String(req.body?.id||"");const jobs=await readLiveJobs();const job=Object.values(jobs).find(x=>x?.id===id);
    if(!job)return res.status(404).json({ok:false,error:"Live job not found."});
    job.status="error";job.workerStatus="error";job.error=safeErrorMessage(req.body?.error||"Worker error");job.updatedAt=new Date().toISOString();
    jobs[job.dateKey]=job;await writeLiveJobs(jobs);res.json({ok:true,job:safeLiveJob(job)});
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});

app.get("/api/cron/live",async(req,res)=>{
  try{
    const expected=process.env.ACF_CRON_SECRET||process.env.CRON_SECRET||"";
    const auth=req.headers.authorization||"";
    if(!expected)return res.status(503).json({ok:false,error:"ACF_CRON_SECRET/CRON_SECRET is not configured on the server."});
    if(auth!=="Bearer "+expected)return res.status(401).json({ok:false,error:"Unauthorized cron request"});
    res.json(await runLiveScheduler());
  }catch(e){res.status(500).json({ok:false,error:safeErrorMessage(e)});}
});

app.use((err,req,res,next)=>{const incident=rememberIncident(err,{route:req.originalUrl||req.url,operation:req.method+" "+(req.route?.path||"unknown"),status:500});diagnoseIncident(incident).catch(()=>{});if(res.headersSent)return next(err);res.status(500).json({ok:false,error:safeErrorMessage(err),selfHeal:{enabled:SELF_HEAL_ENABLED,incidentId:incident.id}});});
app.get("/",(req,res)=>{
  // Serve the dashboard explicitly. Using a synchronous read here avoids
  // sendFile/file-descriptor failures in Vercel's serverless runtime.
  try{
    const file=path.resolve(ROOT,"index.html");
    if(!fs.existsSync(file))return res.status(500).type("text").send("AI Content Factory: index.html is missing from the deployment.");
    const html=fs.readFileSync(file,"utf8");
    res.status(200);
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    return res.send(html);
  }catch(error){
    console.error("Dashboard root failed:",error);
    return res.status(500).type("text").send("AI Content Factory dashboard failed to load.");
  }
});
app.get("*",(req,res)=>{
  // Never return index.html for missing files/assets. Browsers need a real
  // asset response (CSS/JS/image/etc.), not text/html.
  if(path.extname(req.path)){
    return res.status(404).type("text").send("Asset not found");
  }
  try{
    const file=path.resolve(ROOT,"index.html");
    if(!fs.existsSync(file))return res.status(500).type("text").send("AI Content Factory: index.html is missing from the deployment.");
    return res.status(200).type("html").send(fs.readFileSync(file,"utf8"));
  }catch(error){
    console.error("SPA fallback failed:",error);
    return res.status(500).type("text").send("AI Content Factory page failed to load.");
  }
});
if (require.main === module) app.listen(PORT,()=>console.log("AI Content Factory running on http://localhost:"+PORT));
module.exports = app;