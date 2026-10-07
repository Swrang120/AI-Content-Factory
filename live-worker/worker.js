#!/usr/bin/env node
/*
 AI Content Factory — YouTube Live Worker
 Runs outside Vercel on an always-on machine with FFmpeg installed.
 Node 22+ required. No npm dependency is required.
*/
"use strict";
const {spawn}=require("child_process");

const API=String(process.env.ACF_API_URL||"").replace(/\/+$/,"");
const TOKEN=String(process.env.LIVE_WORKER_TOKEN||"");
const FFMPEG=String(process.env.FFMPEG_PATH||"ffmpeg");
const POLL_MS=Math.max(5000,Number(process.env.LIVE_WORKER_POLL_MS||15000));
const RETRY_MS=Math.max(2000,Number(process.env.LIVE_WORKER_RETRY_MS||5000));

if(!API||!TOKEN){
  console.error("Set ACF_API_URL and LIVE_WORKER_TOKEN.");
  process.exit(1);
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,options={}){
  const headers={"x-live-worker-token":TOKEN,"content-type":"application/json",...(options.headers||{})};
  const r=await fetch(API+path,{...options,headers});
  const text=await r.text();
  let body={};try{body=text?JSON.parse(text):{};}catch{body={error:text||"Invalid JSON response"};}
  if(!r.ok||body.ok===false)throw new Error(body.error||("HTTP "+r.status));
  return body;
}
function runFFmpeg(job){
  const duration=Math.max(60,Math.round((new Date(job.scheduledEndTime)-new Date(job.scheduledStartTime))/1000));
  const rtmp=job.rtmpUrl;
  if(!rtmp)throw new Error("Worker received no RTMP target.");

  const commonVideo=[
    "-re",
    "-stream_loop","-1",
    "-i",job.mediaUrl
  ];
  let args;
  if(job.mediaType==="audio"){
    args=[
      ...commonVideo,
      "-f","lavfi","-i","color=c=black:s=1280x720:r=30",
      "-map","1:v:0","-map","0:a:0",
      "-c:v","libx264","-preset","veryfast","-tune","zerolatency",
      "-pix_fmt","yuv420p","-r","30","-g","60","-b:v","2500k","-maxrate","2800k","-bufsize","5000k",
      "-c:a","aac","-b:a","128k","-ar","44100","-ac","2",
      "-t",String(duration),"-f","flv",rtmp
    ];
  }else{
    args=[
      ...commonVideo,
      "-map","0:v:0","-map","0:a:0?",
      "-c:v","libx264","-preset","veryfast","-tune","zerolatency",
      "-pix_fmt","yuv420p","-r","30","-g","60","-b:v","2500k","-maxrate","2800k","-bufsize","5000k",
      "-c:a","aac","-b:a","128k","-ar","44100","-ac","2",
      "-t",String(duration),"-f","flv",rtmp
    ];
  }
  console.log(new Date().toISOString(),"Starting FFmpeg for",job.id);
  return spawn(FFMPEG,args,{stdio:["ignore","inherit","inherit"]});
}
async function startYouTube(job){
  for(let i=0;i<12;i++){
    try{
      const result=await api("/api/live/worker/start",{method:"POST",body:JSON.stringify({id:job.id})});
      console.log(new Date().toISOString(),"YouTube live started:",result.youtubeStatus||"live");
      return result;
    }catch(error){
      console.log("YouTube start waiting:",error.message);
      await sleep(RETRY_MS);
    }
  }
  throw new Error("YouTube broadcast did not become live after FFmpeg started.");
}
async function finishYouTube(job){
  try{
    const result=await api("/api/live/worker/finish",{method:"POST",body:JSON.stringify({id:job.id})});
    console.log(new Date().toISOString(),"YouTube live completed:",result.youtubeStatus||"complete");
    return result;
  }catch(error){
    console.error("YouTube finish error:",error.message);
    throw error;
  }
}
async function handleJob(job){
  const startAt=new Date(job.scheduledStartTime).getTime();
  const endAt=new Date(job.scheduledEndTime).getTime();
  const now=Date.now();
  if(now<startAt){
    const wait=Math.min(startAt-now,30000);
    console.log(new Date().toISOString(),"Claimed",job.id,"waiting",Math.ceil((startAt-now)/1000),"sec");
    await sleep(wait);
    return;
  }
  if(now>=endAt){
    await finishYouTube(job).catch(()=>{});
    return;
  }

  const ff=runFFmpeg(job);
  let finished=false;
  const stop=async()=>{
    if(finished)return;
    finished=true;
    try{if(!ff.killed)ff.kill("SIGINT");}catch{}
    await sleep(3000);
    try{await finishYouTube(job);}catch{}
  };
  const timer=setTimeout(stop,Math.max(1000,endAt-Date.now()));

  ff.on("exit",async(code,signal)=>{
    clearTimeout(timer);
    if(finished)return;
    finished=true;
    console.log(new Date().toISOString(),"FFmpeg exited",code,signal);
    try{await api("/api/live/worker/error",{method:"POST",body:JSON.stringify({id:job.id,error:"FFmpeg exited before scheduled end (code="+code+", signal="+signal+")"})});}catch{}
  });

  try{
    await startYouTube(job);
  }catch(error){
    console.error(error.message);
    try{if(!ff.killed)ff.kill("SIGTERM");}catch{}
    clearTimeout(timer);
    try{await api("/api/live/worker/error",{method:"POST",body:JSON.stringify({id:job.id,error:error.message})});}catch{}
  }

  while(!finished){
    await sleep(5000);
    if(Date.now()>=endAt)await stop();
  }
}
async function loop(){
  console.log("AI Content Factory Live Worker online.");
  console.log("API:",API);
  for(;;){
    try{
      const result=await api("/api/live/worker/claim");
      if(result.job)await handleJob(result.job);
      else await sleep(POLL_MS);
    }catch(error){
      console.error(new Date().toISOString(),"Worker poll error:",error.message);
      await sleep(POLL_MS);
    }
  }
}
process.on("SIGINT",()=>process.exit(0));
process.on("SIGTERM",()=>process.exit(0));
loop().catch(error=>{console.error(error);process.exit(1);});
