require("dotenv").config();
const express=require("express");
const path=require("path");
const fs=require("fs");
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
function loadTokens(){try{return JSON.parse(fs.readFileSync(TOKEN_FILE,"utf8"));}catch{return null;}}
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

app.get("/api/health",(req,res)=>res.json({ok:true,service:"AI Content Factory",youtubeToken:!!loadTokens()}));

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
    res.send("<h2>YouTube connected successfully.</h2><p>You can close this tab and return to AI Content Factory.</p><script>setTimeout(()=>window.close(),1200)</script>");
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

/*
  Upload by a server-accessible video URL. This keeps large MP4 files out of the
  serverless/browser request body. Later the production engine can pass its
  rendered asset URL here automatically.
*/
app.post("/api/youtube/upload",requireAppKey,async(req,res)=>{
  try{
    const {videoUrl,title,description="",tags=[],privacyStatus,categoryId="22",publishAt}=req.body||{};
    if(!videoUrl||!title) return res.status(400).json({ok:false,error:"videoUrl and title are required"});
    const yt=await youtube();
    const response=await yt.videos.insert({
      part:"snippet,status",
      requestBody:{
        snippet:{title,description,tags,categoryId},
        status:{
          privacyStatus:privacyStatus||process.env.YOUTUBE_DEFAULT_PRIVACY||"private",
          ...(publishAt?{publishAt}: {})
        }
      },
      media:{body:await fetch(videoUrl).then(r=>{if(!r.ok)throw new Error("Could not fetch video asset");return r.body})}
    });
    res.json({ok:true,videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"index.html")));
app.listen(PORT,()=>console.log("AI Content Factory running on http://localhost:"+PORT));
