require("dotenv").config();
const express=require("express");
const path=require("path");
const fs=require("fs");
const {Readable}=require("stream");
const {google}=require("googleapis");

const app=express();
const PORT=process.env.PORT||3456;
const ROOT=__dirname;
const TOKEN_FILE=path.join(ROOT,".data","youtube-token.json");
const SCOPES=["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube.readonly","https://www.googleapis.com/auth/youtube.force-ssl"];

app.use(express.json({limit:"1mb"}));
app.use(express.static(ROOT));

function oauthClient(){
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET||!process.env.YOUTUBE_REDIRECT_URI)
    throw new Error("YouTube OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and YOUTUBE_REDIRECT_URI.");
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.YOUTUBE_REDIRECT_URI);
}
function requireAppKey(req,res,next){
  if(!process.env.APP_API_KEY) return next();
  if(req.headers["x-api-key"]!==process.env.APP_API_KEY) return res.status(401).json({ok:false,error:"Unauthorized"});
  next();
}
function loadTokens(){
  if(process.env.YOUTUBE_REFRESH_TOKEN) return {refresh_token:process.env.YOUTUBE_REFRESH_TOKEN};
  try{return JSON.parse(fs.readFileSync(TOKEN_FILE,"utf8"));}catch{return null;}
}
function saveTokens(tokens){
  fs.mkdirSync(path.dirname(TOKEN_FILE),{recursive:true});
  fs.writeFileSync(TOKEN_FILE,JSON.stringify(tokens,null,2));
}
async function youtube(){
  const tokens=loadTokens();
  if(!tokens) throw new Error("YouTube is not connected. Open Platforms and connect YouTube first.");
  const client=oauthClient();
  client.setCredentials(tokens);
  client.on("tokens",t=>saveTokens({...tokens,...t}));
  return google.youtube({version:"v3",auth:client});
}


async function generateWithChatGPT(task, fields){
  if(!process.env.OPENAI_API_KEY) throw new Error("ChatGPT API is not configured. Add OPENAI_API_KEY on the server.");
  const model=process.env.OPENAI_MODEL||"gpt-6-luna";
  const instructions="You are the Content Brain for a private AI Content Factory. Create original, useful, platform-safe content. Never invent factual claims when the user provides source material. Return only the requested content, with clear headings when useful.";
  const prompt=[
    "TASK: "+task,
    "",
    "CONTENT INPUT:",
    JSON.stringify(fields||{},null,2),
    "",
    "OUTPUT REQUIREMENTS:",
    "Write for YouTube first. Keep language natural and audience-friendly. Avoid copyrighted song lyrics, copied scripts, or fabricated sources."
  ].join("\n");
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization:"Bearer "+process.env.OPENAI_API_KEY},
    body:JSON.stringify({model,input:[{role:"system",content:instructions},{role:"user",content:prompt}],store:false})
  });
  const body=await response.json();
  if(!response.ok) throw new Error(body?.error?.message||"ChatGPT API request failed");
  return body.output_text||"";
}

app.get("/api/ai/status",requireAppKey,(req,res)=>{
  res.json({ok:true,configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||"gpt-6-luna"});
});

app.post("/api/ai/generate",requireAppKey,async(req,res)=>{
  try{
    const {task="script",topic,category="",language="English",format="Long Video",notes="",sourceText=""}=req.body||{};
    if(!topic) return res.status(400).json({ok:false,error:"topic is required"});
    const output=await generateWithChatGPT(task,{topic,category,language,format,notes,sourceText});
    res.json({ok:true,task,output});
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});
\napp.get("/api/health",(req,res)=>res.json({ok:true,service:"AI Content Factory",youtubeToken:!!loadTokens()}));

app.get("/auth/youtube",(req,res)=>{
  try{
    const client=oauthClient();
    const url=client.generateAuthUrl({access_type:"offline",prompt:"consent",scope:SCOPES});
    res.redirect(url);
  }catch(e){res.status(500).send(e.message);}
});

app.get("/auth/youtube/callback",async(req,res)=>{
  try{
    if(req.query.error) return res.status(400).send("YouTube authorization denied: "+req.query.error);
    const client=oauthClient();
    const {tokens}=await client.getToken(req.query.code);
    saveTokens(tokens);
    res.send("<h2>YouTube connected successfully.</h2><p>Credentials were saved on the server. You can close this tab.</p><script>setTimeout(()=>window.close(),1200)</script>");
  }catch(e){res.status(500).send("OAuth callback failed: "+e.message);}
});

app.get("/api/youtube/status",requireAppKey,async(req,res)=>{
  try{
    const yt=await youtube();
    const r=await yt.channels.list({part:"snippet,statistics",mine:true});
    const c=r.data.items?.[0];
    if(!c) return res.json({ok:false,connected:false,error:"No YouTube channel found"});
    res.json({ok:true,connected:true,channel:{id:c.id,title:c.snippet.title,subscribers:c.statistics?.subscriberCount||null}});
  }catch(e){res.status(400).json({ok:false,connected:false,error:e.message});}
});

/* The production worker sends a server-accessible rendered video URL. */
app.post("/api/youtube/upload",requireAppKey,async(req,res)=>{
  try{
    const {videoUrl,title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.body||{};
    if(!videoUrl||!title) return res.status(400).json({ok:false,error:"videoUrl and title are required"});
    const asset=await fetch(videoUrl);
    if(!asset.ok||!asset.body) throw new Error("Could not fetch video asset");
    const yt=await youtube();
    const status={privacyStatus:privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private"};
    if(publishAt) status.publishAt=publishAt;
    const response=await yt.videos.insert({
      part:"snippet,status",
      requestBody:{snippet:{title,description,tags,categoryId},status},
      media:{body:Readable.fromWeb(asset.body)}
    });
    res.json({ok:true,videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"index.html")));
app.listen(PORT,()=>console.log("AI Content Factory running on http://localhost:"+PORT));