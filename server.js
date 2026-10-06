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
  // YouTube-only publishing: Meta/Facebook/Instagram are intentionally NOT called here.
  return {videoId:response.data.id,url:"https://www.youtube.com/watch?v="+response.data.id,privacyStatus:response.data.status?.privacyStatus||privacyStatus,platform:"youtube"};
}

// Automatic Research → Script pipeline
app.post("/api/pipeline/research",requireAppKey,async(req,res)=>{