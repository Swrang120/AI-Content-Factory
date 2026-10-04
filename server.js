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
async function loadTokens(){
  if(process.env.YOUTUBE_REFRESH_TOKEN)return {refresh_token:process.env.YOUTUBE_REFRESH_TOKEN};
  if(supabase){
    try{
      const {data,error}=await supabase.from("youtube_connections").select("tokens").eq("id","default").maybeSingle();
      if(!error&&data?.tokens)return data.tokens;
    }catch{}
  }
  try{return JSON.parse(fs.readFileSync(TOKEN_FILE,"utf8"));}catch{return null;}
}
async function saveTokens(tokens){
  if(supabase){
    try{
      const {error}=await supabase.from("youtube_connections").upsert({
        id:"default",
        tokens,
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
function loadSettings(){try{return JSON.parse(fs.readFileSync(SETTINGS_FILE,"utf8"));}catch{return {autoGenerate:false,approval:true,autoPublish:false};}}
function saveSettings(settings){fs.mkdirSync(path.dirname(SETTINGS_FILE),{recursive:true});fs.writeFileSync(SETTINGS_FILE,JSON.stringify(settings,null,2));}
function loadJobs(){try{return JSON.parse(fs.readFileSync(JOBS_FILE,"utf8"));}catch{return {};}}
function saveJobs(jobs){fs.mkdirSync(path.dirname(JOBS_FILE),{recursive:true});fs.writeFileSync(JOBS_FILE,JSON.stringify(jobs,null,2));}
function jobId(){return "job_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);}
async function persistJob(job){
  if(!supabase)return;
  const row={id:job.id,status:job.status,topic:job.topic||"",category:job.category||"",language:job.language||"English",format:job.format||"Long Video",notes:job.notes||"",source_text:job.sourceText||"",sources:job.sources||[],research:job.research||null,script:job.script||null,voice:job.voice||null,rendered_video_url:job.renderedVideoUrl||null,approved:!!job.approved,youtube:job.youtube||null,created_at:job.createdAt||new Date().toISOString(),updated_at:job.updatedAt||new Date().toISOString()};
  const {error}=await supabase.from("content_jobs").upsert(row,{onConflict:"id"});
  if(error)throw new Error("Supabase content_jobs write failed: "+error.message);
}
async function getJobFromSupabase(id){
  if(!supabase)return null;
  const {data,error}=await supabase.from("content_jobs").select("*").eq("id",id).maybeSingle();
  if(error)throw new Error("Supabase content_jobs read failed: "+error.message);
  if(!data)return null;
  return {id:data.id,status:data.status,topic:data.topic,category:data.category,language:data.language,format:data.format,notes:data.notes,sourceText:data.source_text,sources:data.sources||[],research:data.research,script:data.script,voice:data.voice,renderedVideoUrl:data.rendered_video_url||null,approved:!!data.approved,youtube:data.youtube||null,createdAt:data.created_at,updatedAt:data.updated_at};
}
async function youtube(){
  const tokens=await loadTokens();
  if(!tokens)throw new Error("YouTube is not connected. Open Platforms and connect YouTube first.");
  const client=oauthClient();
  client.setCredentials(tokens);
  client.on("tokens",t=>{saveTokens({...tokens,...t}).catch(()=>{});});
  return google.youtube({version:"v3",auth:client});
}
async function generateWithChatGPT(task,fields){if(!process.env.OPENAI_API_KEY)throw new Error("ChatGPT API is not configured. Add OPENAI_API_KEY on the server.");const model=process.env.OPENAI_MODEL||"gpt-6-luna";const instructions="You are the Content Brain for a private AI Content Factory. Create original, useful, platform-safe content. Never invent factual claims when source material is provided. For current news or sports facts, use only supplied source material.";const prompt=["TASK: "+task,"","CONTENT INPUT:",JSON.stringify(fields||{},null,2),"","OUTPUT REQUIREMENTS:","Write for YouTube first. Avoid copyrighted song lyrics, copied scripts, or fabricated sources."].join("\n");const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model,instructions,input:[{role:"user",content:prompt}],store:false})});const body=await response.json();if(!response.ok)throw new Error(body?.error?.message||"ChatGPT API request failed");return body.output_text||"";}
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
  fs.mkdirSync(VOICE_DIR,{recursive:true});
  const file=path.join(VOICE_DIR,job.id+".mp3");
  fs.writeFileSync(file,audio);
  job.voice={status:"ready",file:"/api/pipeline/jobs/"+job.id+"/voice",model:process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2",voiceId:selectedVoice,generatedAt:new Date().toISOString()};
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

async function publishRenderedYouTubeVideo(p){
  if(!p?.videoUrl||!p?.title)throw new Error("videoUrl and title are required");
  const settings=loadSettings();
  if(!settings.autoPublish)throw new Error("Auto Publish is OFF.");
  if(settings.approval&&!p.approved)throw new Error("Human approval is required before publishing.");
  const asset=await fetch(p.videoUrl);
  if(!asset.ok||!asset.body)throw new Error("Could not fetch rendered video asset");
  const yt=await youtube();
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
        approved:!!job.approved
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
        const youtubeResult=await publishRenderedYouTubeVideo({videoUrl,title:job.title,description,tags:job.tags,categoryId,privacyStatus,publishAt,approved:job.approved});
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
          approved:true
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
app.get("/api/health",async(req,res)=>res.json({ok:true,service:"AI Content Factory",youtubeToken:!!(await loadTokens()),supabase:!!supabase,settings:loadSettings()}));
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
    const existing=await loadTokens();
    await saveTokens({...existing,...tokens});
    res.setHeader("Set-Cookie","acf_youtube_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    res.send("<h2>YouTube connected successfully.</h2><p>Your YouTube authorization was saved securely on the server.</p><p>You can close this tab and return to AI Content Factory.</p><script>setTimeout(()=>window.close(),1200)</script>");
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
app.get("/api/youtube/status",async(req,res)=>{
  try{
    const yt=await youtube();
    const r=await yt.channels.list({part:"snippet,statistics",mine:true});
    const c=r.data.items?.[0];
    if(!c)return res.json({ok:false,connected:false,error:"No YouTube channel found for the authorized Google account."});
    res.json({ok:true,connected:true,channel:{id:c.id,title:c.snippet.title,subscribers:c.statistics?.subscriberCount||null}});
  }catch(e){
    res.status(400).json({ok:false,connected:false,error:e.message});
  }
});
app.get("/api/factory/settings",requireAppKey,(req,res)=>res.json({ok:true,settings:loadSettings()}));
app.post("/api/factory/settings",requireAppKey,(req,res)=>{try{const next={...loadSettings(),...(req.body||{})};next.autoGenerate=!!next.autoGenerate;next.approval=next.approval!==false;next.autoPublish=!!next.autoPublish;saveSettings(next);res.json({ok:true,settings:next});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post("/api/youtube/upload-file",requireAppKey,express.raw({type:["video/mp4","video/*","application/octet-stream"],limit:"50mb"}),async(req,res)=>{
  try{
    const {title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.query||{};
    if(!title)return res.status(400).json({ok:false,error:"title is required"});
    if(!req.body||!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({ok:false,error:"MP4 file body is required"});
    const selectedPrivacy=privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private";
    if(selectedPrivacy==="public"&&loadSettings().approval)return res.status(409).json({ok:false,error:"Approval is required before public publishing."});
    const yt=await youtube();
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
app.post("/api/youtube/upload",requireAppKey,async(req,res)=>{try{const {videoUrl,title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.body||{};if(!videoUrl||!title)return res.status(400).json({ok:false,error:"videoUrl and title are required"});if((privacyStatus||"private")==="public"&&loadSettings().approval)throw new Error("Approval is required before public publishing.");const asset=await fetch(videoUrl);if(!asset.ok||!asset.body)throw new Error("Could not fetch video asset");const yt=await youtube();const status={privacyStatus:privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private"};if(publishAt)status.publishAt=publishAt;const response=await yt.videos.insert({part:"snippet,status",requestBody:{snippet:{title,description,tags,categoryId},status},media:{body:Readable.fromWeb(asset.body)}});res.json({ok:true,videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||status.privacyStatus});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post("/api/publisher/youtube",requireAppKey,async(req,res)=>{try{const p=req.body||{};const result=await publishRenderedYouTubeVideo(p);res.json({ok:true,published:true,...result});}catch(e){const code=e.message==="Auto Publish is OFF."||e.message==="Human approval is required before publishing."?409:500;res.status(code).json({ok:false,published:false,error:e.message});}});
app.get("*",(req,res)=>{
  // Never return index.html for missing files/assets. Browsers need a real
  // asset response (CSS/JS/image/etc.), not text/html.
  if(path.extname(req.path)){
    return res.status(404).type("text").send("Asset not found");
  }
  res.sendFile(path.resolve(ROOT,"index.html"));
});
if (require.main === module) app.listen(PORT,()=>console.log("AI Content Factory running on http://localhost:"+PORT));
module.exports = app;