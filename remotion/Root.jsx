import React from "react";
import {AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig} from "remotion";

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function Scene({text,index,total}) {
  const frame=useCurrentFrame();
  const {durationInFrames}=useVideoConfig();
  const local=frame-(index*Math.floor(durationInFrames/total));
  const opacity=interpolate(local,[0,12,Math.max(13,Math.floor(durationInFrames/total)-12),Math.floor(durationInFrames/total)],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const y=interpolate(local,[0,18],[30,0],{extrapolateRight:"clamp"});
  return <Sequence from={index*Math.floor(durationInFrames/total)} durationInFrames={Math.floor(durationInFrames/total)+2}>
    <AbsoluteFill style={{justifyContent:"center",padding:"110px 120px",background:"linear-gradient(135deg,#07111f,#10243b 55%,#07111f)",color:"#fff",fontFamily:"Arial, sans-serif",opacity}}>
      <div style={{fontSize:30,letterSpacing:5,textTransform:"uppercase",opacity:.65,marginBottom:35}}>AI CONTENT FACTORY</div>
      <div style={{fontSize:64,fontWeight:800,lineHeight:1.12,transform:`translateY(${y}px)`}}>{text}</div>
      <div style={{position:"absolute",left:120,right:120,bottom:80,height:6,background:"rgba(255,255,255,.18)",borderRadius:9}}>
        <div style={{height:"100%",width:`${clamp(frame/Math.max(1,durationInFrames))*100}%`,background:"#fff",borderRadius:9}}/>
      </div>
    </AbsoluteFill>
  </Sequence>
}

export const FactoryVideo=({title="AI Content Factory",script="",audioUrl="",musicUrl="",musicStartSeconds=0,musicDurationSeconds=25,spotifyUrl="",artist="",durationSeconds=45})=>{
  const {fps,durationInFrames}=useVideoConfig();
  const clean=String(script||"").replace(/\s+/g," ").trim();
  const words=clean.split(" ").filter(Boolean);
  const chunks=[];
  const chunkSize=Math.max(12,Math.ceil(words.length/6));
  for(let i=0;i<words.length;i+=chunkSize)chunks.push(words.slice(i,i+chunkSize).join(" "));
  const scenes=[title,...chunks].slice(0,7);
  return <AbsoluteFill>
    {scenes.map((s,i)=><Scene key={i} text={s} index={i} total={scenes.length}/>)}
    {audioUrl?<Audio src={audioUrl} volume={1}/>:null}
    {musicUrl?<Audio src={musicUrl} volume={1} startFrom={Math.round(Number(musicStartSeconds||0)*fps)} endAt={Math.round((Number(musicStartSeconds||0)+Number(musicDurationSeconds||25))*fps)}/>:null}
    {musicUrl?<AbsoluteFill style={{justifyContent:"flex-end",padding:"0 70px 55px",pointerEvents:"none"}}><div style={{alignSelf:"center",textAlign:"center",background:"rgba(0,0,0,.62)",borderRadius:28,padding:"18px 30px",maxWidth:"88%",color:"#fff",fontFamily:"Arial, sans-serif"}}><div style={{fontSize:38,fontWeight:800}}>{title}</div><div style={{fontSize:24,opacity:.9,marginTop:8}}>{artist}</div><div style={{fontSize:18,opacity:.72,marginTop:8}}>🎵 Original Music • Listen on Spotify</div></div></AbsoluteFill>:null}
  </AbsoluteFill>
};

export const FACTORY_FPS=30;
export const FACTORY_WIDTH=1920;
export const FACTORY_HEIGHT=1080;
export const FACTORY_DURATION_SECONDS=45;
