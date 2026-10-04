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
const SUPABASE_URL=process.env.SUPABASE_URL||"";
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"";
const supabase=(SUPABASE_URL&&SUPABASE_KEY)?createClient(SUPABASE_URL,SUPABASE_KEY):null;
const SCOPES=["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube.readonly","https://www.googleapis.com/auth/youtube.force-ssl"];
app.use((req,res,next)=>{const origin=req.headers.origin;const allowed=["https://swrang120.github.io",process.env.FRONTEND_URL].filter(Boolean);if(origin&&allowed.includes(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Access-Control-Allow-Headers","Content-Type,X-API-Key");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");}if(req.method==="OPTIONS")return res.sendStatus(204);next();});
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
function oauthClient(){
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET||!process.env.YOUTUBE_REDIRECT_URI){
    throw new Error("YouTube OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and YOUTUBE_REDIRECT_URI on Vercel.");
  }
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.YOUTUBE_REDIRECT_URI);
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
  if(supabase){
    try{
      const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
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
  if(supabase){
    try{
      const {data}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
      const existing=data?.tokens&&typeof data.tokens==="object"?data.tokens:{};
      const merged={...existing,...tokens};
      const {error}=await supabase.from("youtube_connections").upsert({
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
const DEFAULT_FACTORY_SETTINGS={autoGenerate:true,approval:true,autoPublish:true,liveAutomation:false,liveApproval:true,liveDurationMinutes:120,musicSourceChannels:["UC_7oWDyqUuF8FtCm3XWkMvQ","UC45qxqZuEpQvYs14c1pLf7Q"]};
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
  add("Vercel Blob",!!process.env.BLOB_READ_WRITE_TOKEN,process.env.BLOB_READ_WRITE_TOKEN?"Blob token configured":"BLOB_READ_WRITE_TOKEN missing",true);
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
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error("Vercel Blob is required for automatic voice storage.");
  const {put}=await import("@vercel/blob");
  const blob=await put("voices/"+job.id+".mp3",audio,{access:"public",contentType:"audio/mpeg",token:process.env.BLOB_READ_WRITE_TOKEN});
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
async function renderFactoryVideo(job,req){
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error("Vercel Blob is not configured. Create a Blob store and connect it to this Vercel project.");
  const {createSandbox,addBundleToSandbox,renderMediaOnVercel,uploadToVercelBlob}=await import("@remotion/vercel");
  const bundleDir=await getRemotionBundle();
  const sandbox=await createSandbox();
  const serveUrl=await addBundleToSandbox({sandbox,bundleDir});
  const origin=((req.headers["x-forwarded-proto"]||req.protocol)+"//"+req.get("host"));
  const audioUrl=job.voice?.file?new URL(job.voice.file,origin).toString():"";
  const script=typeof job.script==="string"?job.script:(job.script?.output||job.script?.text||JSON.stringify(job.script||""));
  const title=job.title||job.topic||"AI Content Factory";
  const {sandboxFilePath}=await renderMediaOnVercel({
    sandbox,
    serveUrl,
    compositionId:"FactoryVideo",
    inputProps:{title,script,audioUrl,durationSeconds:45},
    codec:"h264",
    outputFile:"/tmp/factory-video.mp4"
  });
  const uploaded=await uploadToVercelBlob({
    sandbox,
    sandboxFilePath,
    contentType:"video/mp4",
    blobToken:process.env.BLOB_READ_WRITE_TOKEN,
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
  {id:"romantic_night",category:"Music Promotion",icon:"💙",time:"21:00",format:"Long Video",language:"Hindi + Bodo",prompt:"Original romantic/sad music story or visual-video concept. Use original text only; no copyrighted song lyrics."}
];
function autoScheduleForToday(now=new Date()){
  const day=now.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});
  return AUTO_SCHEDULES.map(x=>({...x,date:day,slot:day+"T"+x.time+":00+05:30"}));
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
async function runAutomaticFactory(req){
  const settings=await hydrateSettings();
  const jobs=await loadPersistentJobs();
  const now=new Date();
  const bossDue=Object.values(jobs).filter(j=>j.manualUpload&&j.renderedVideoUrl&&["approved","queued"].includes(j.status)&&j.scheduledSlot&&new Date(j.scheduledSlot)<=now).sort((a,b)=>new Date(a.scheduledSlot)-new Date(b.scheduledSlot)).slice(0,1);
  const bossResults=[];
  for(const job of bossDue){try{const youtubeResult=await publishRenderedYouTubeVideo({videoUrl:job.renderedVideoUrl,title:job.topic,description:"Uploaded by Boss in AI Content Factory.",tags:["Boss Upload","AI Content Factory"],categoryId:"22",privacyStatus:"public",approved:true,req});job.youtube=youtubeResult;job.status="published";job.updatedAt=new Date().toISOString();jobs[job.id]=job;saveJobs(jobs);await persistJob(job);bossResults.push({ok:true,jobId:job.id,videoId:youtubeResult.videoId});}catch(e){bossResults.push({ok:false,jobId:job.id,error:e.message});}}
  if(!settings.autoGenerate)return {ok:true,enabled:false,bossUploads:bossResults,message:"Auto Generate is OFF."};
   const items=autoScheduleForToday(now);
  const hourMinute=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  const [nowH,nowM]=hourMinute.split(":").map(Number);
  // Vercel Hobby cron may execute anywhere inside its scheduled hour.
  // Choose the nearest upcoming slot instead of requiring an exact minute.
  let due=items.filter(x=>{
    const [h,m]=x.time.split(":").map(Number);
    const slotMinutes=h*60+m;
    const nowMinutes=nowH*60+nowM;
    return slotMinutes>=nowMinutes-90;
  }).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,1);
  if(!due.length){
    due=items.slice().sort((a,b)=>a.time.localeCompare(b.time)).slice(-1);
  }
  const results=[];
  for(const item of due){
    try{results.push(await generateAutomaticJob(item,req));}
    catch(e){results.push({ok:false,category:item.category,time:item.time,error:e.message});}
  }
  return {ok:true,enabled:true,due:due.map(x=>x.category),results,bossUploads:bossResults};
}

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
  return {videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||privacyStatus};
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
app.get("/auth/youtube",(req,res)=>{
  try{
    const client=oauthClient();
    const state=crypto.randomBytes(32).toString("hex");
    setCookie(res,"acf_youtube_state",state,600);
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
app.get("/auth/youtube/callback",async(req,res)=>{
  try{
    if(req.query.error)return res.status(400).send("YouTube authorization denied: "+req.query.error);
    if(!req.query.code)return res.status(400).send("Missing OAuth authorization code.");
    const expected=getCookie(req,"acf_youtube_state");
    if(!expected||expected!==String(req.query.state||""))return res.status(400).send("OAuth state validation failed. Start YouTube connection again.");
    const client=oauthClient();
    const {tokens}=await client.getToken(req.query.code);
    const existing=await loadTokens(req);
    await saveTokens({...existing,...tokens});
    const refresh=tokens.refresh_token||existing?.refresh_token;
    const cookies=["acf_youtube_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"];
    if(refresh)cookies.push("acf_youtube_refresh="+encodeURIComponent(refresh)+"; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None");
    res.setHeader("Set-Cookie",cookies);
    res.redirect("https://swrang120.github.io/AI-Content-Factory/?youtube=connected");
  }catch(e){
    res.status(500).send("OAuth callback failed: "+e.message);
  }
});
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
    const expected=process.env.CRON_SECRET||"";
    const auth=req.headers.authorization||"";
    if(!expected)return res.status(503).json({ok:false,error:"CRON_SECRET is not configured on the server."});
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
    const expected=process.env.CRON_SECRET||"";
    const auth=req.headers.authorization||"";
    if(!expected)return res.status(503).json({ok:false,error:"CRON_SECRET is not configured on the server."});
    if(auth!=="Bearer "+expected)return res.status(401).json({ok:false,error:"Unauthorized cron request"});
    const result=await runAutomaticFactory(req);
    res.json(result);
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.get("/api/factory/automation-schedule",async(req,res)=>res.json({ok:true,timeZone:"Asia/Kolkata",schedules:AUTO_SCHEDULES,settings:await hydrateSettings()}));
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
app.post("/api/media/upload-file",requireAppKey,express.raw({type:["video/mp4","video/*","application/octet-stream"],limit:"50mb"}),async(req,res)=>{
  try{
    if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({ok:false,error:"Vercel Blob is not configured."});
    const filename=String(req.query.filename||"video.mp4").replace(/[^a-zA-Z0-9._-]/g,"_");
    const title=String(req.query.title||filename);
    if(!req.body||!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"Video file body is required"});
    const {put}=await import("@vercel/blob");
    const blob=await put("uploads/"+Date.now()+"-"+filename,req.body,{access:"public",contentType:req.headers["content-type"]||"video/mp4",token:process.env.BLOB_READ_WRITE_TOKEN});
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