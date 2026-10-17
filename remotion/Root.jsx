import React from "react";
import {AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig} from "remotion";

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const detectCategory=(title,script,musicUrl)=>{
  if(musicUrl)return "music";
  const s=(String(title||"")+" "+String(script||"")).toLowerCase();
  if(/capcut|alight motion|premiere pro|video edit|editing|transition|color grading|timeline|vn editor/.test(s))return "editing";
  if(/match|score|player|tournament|football|cricket|sports|goal|wicket/.test(s))return "sports";
  if(/news|breaking|update|report|today|latest|headline/.test(s))return "news";
  if(/product|price|buy|shop|feature|benefit|review|offer/.test(s))return "product";
  if(/ai |artificial intelligence|technology|tech tool|automation|robot|software|app/.test(s))return "tech";
  return "general";
};
const THEMES={
 music:{label:"ORIGINAL MUSIC",a:"#ff4f91",b:"#6b35d5",c:"#ffd166"},
 editing:{label:"CREATOR TUTORIAL",a:"#20d9d2",b:"#1659a8",c:"#b7ff6a"},
 news:{label:"VERIFIED UPDATE",a:"#ff7043",b:"#7b1d42",c:"#ffe082"},
 sports:{label:"SPORTS INSIGHT",a:"#a4f34a",b:"#087e68",c:"#fff176"},
 product:{label:"PRODUCT SPOTLIGHT",a:"#ffbd4a",b:"#b84e20",c:"#fff2cc"},
 tech:{label:"AI & TECHNOLOGY",a:"#55d9ff",b:"#4036b7",c:"#d6fffb"},
 general:{label:"USEFUL EXPLAINER",a:"#6ce5c4",b:"#3151a8",c:"#ffffff"}
};
function CategoryVisual({kind,theme,index}){
 const f=useCurrentFrame();
 const pulse=1+Math.sin(f/8)*.06;
 if(kind==="music")return <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",gap:12,opacity:.88,transform:`scale(${pulse})`}}>
  {Array.from({length:31},(_,i)=><div key={i} style={{width:8,borderRadius:12,height:34+Math.abs(Math.sin((f/5)+i*.72))*220,background:`linear-gradient(180deg,${theme.c},${theme.a})`,boxShadow:`0 0 24px ${theme.a}66`}}/>)}
 </div>;
 if(kind==="editing")return <div style={{position:"absolute",left:"7%",right:"7%",bottom:"17%",height:"30%",padding:18,border:"2px solid #ffffff44",borderRadius:24,background:"#06101ed9",boxShadow:"0 24px 80px #0008"}}>
  <div style={{display:"flex",gap:9,marginBottom:12}}>{["#ff6b6b",theme.c,theme.a].map((c,i)=><i key={i} style={{width:12,height:12,borderRadius:20,background:c}}/>)}<span style={{color:"#fff9",fontSize:17,marginLeft:8}}>EDIT TIMELINE · BEFORE → AFTER</span></div>
  {[0,1,2].map((row)=><div key={row} style={{height:24,margin:"7px 0",borderRadius:8,width:`${92-row*13}%`,background:`linear-gradient(90deg,${theme.a},${theme.b} 48%,${theme.c})`,transform:`translateX(${Math.sin(f/12+row)*12}px)`}}/>)}
  <div style={{position:"absolute",top:44,bottom:10,left:`${Math.min(94,10+(f%180)/180*80)}%`,width:3,background:"#fff",boxShadow:"0 0 16px #fff"}}/>
 </div>;
 if(kind==="sports")return <div style={{position:"absolute",top:"12%",right:"7%",padding:"22px 28px",borderRadius:22,background:"#061b19e8",border:`2px solid ${theme.a}`,boxShadow:`0 0 45px ${theme.a}55`,transform:`translateY(${Math.sin(f/10)*8}px)`}}>
  <div style={{fontSize:17,letterSpacing:4,color:theme.c}}>MATCH CENTER</div><div style={{fontSize:46,fontWeight:900,color:"#fff",marginTop:8}}>LIVE • INFO</div><div style={{height:5,background:theme.a,marginTop:12,borderRadius:9,width:`${45+(f%50)}%`}}/>
 </div>;
 if(kind==="news")return <div style={{position:"absolute",left:0,right:0,top:"12%",padding:"17px 0",background:theme.a,color:"#180b10",fontWeight:900,letterSpacing:5,fontSize:22,whiteSpace:"nowrap",transform:`translateX(${-(f*2%500)}px)`}}> VERIFIED UPDATE  •  FACTS FIRST  •  CHECK THE SOURCE  •  VERIFIED UPDATE  •  FACTS FIRST  •  </div>;
 if(kind==="product")return <div style={{position:"absolute",right:"10%",top:"20%",width:"35%",height:"42%",borderRadius:34,background:`linear-gradient(145deg,${theme.a},${theme.b})`,border:"2px solid #ffffff99",boxShadow:`0 25px 90px ${theme.a}44`,transform:`rotate(${Math.sin(f/16)*5}deg) scale(${pulse})`,display:"flex",alignItems:"center",justifyContent:"center"}}>
  <div style={{width:"62%",height:"70%",borderRadius:26,background:"linear-gradient(145deg,#ffffffdd,#ffffff22)",border:"2px solid #fff",boxShadow:"inset 0 0 40px #fff8"}}><div style={{margin:"24% auto",width:"55%",height:"35%",borderRadius:"50%",background:theme.b,opacity:.8}}/></div>
 </div>;
 if(kind==="tech")return <svg viewBox="0 0 1000 1000" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.75}}>
  {Array.from({length:12},(_,i)=>{const x=100+(i*137)%800,y=100+(i*211)%800;return <g key={i}><line x1={x} y1={y} x2={500+Math.sin(f/20+i)*260} y2={500+Math.cos(f/20+i)*260} stroke={theme.a} strokeWidth="3" opacity=".45"/><circle cx={x} cy={y} r={8+(i%3)*5} fill={theme.c}/></g>})}
 </svg>;
 return <div style={{position:"absolute",right:"9%",top:"18%",width:"32%",height:"38%",borderRadius:"50%",border:`3px solid ${theme.a}99`,boxShadow:`0 0 100px ${theme.a}44,inset 0 0 80px ${theme.b}88`,transform:`scale(${pulse}) rotate(${f/5}deg)`}}><div style={{position:"absolute",inset:"18%",borderRadius:"50%",border:`2px dashed ${theme.c}`}}/></div>;
}
function Scene({text,index,total,kind,theme,title}){
 const frame=useCurrentFrame();const {durationInFrames}=useVideoConfig();
 const per=Math.floor(durationInFrames/total);const local=frame-index*per;
 const opacity=interpolate(local,[0,10,Math.max(11,per-10),per],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 const y=interpolate(local,[0,18],[35,0],{extrapolateRight:"clamp"});
 return <Sequence from={index*per} durationInFrames={per+2}>
  <AbsoluteFill style={{background:`radial-gradient(ellipse at 78% 24%, ${theme.b} 0%, transparent 48%),linear-gradient(145deg,#050914,#101b2e 55%,#080d18)`,color:"#fff",fontFamily:"Arial,sans-serif",opacity,overflow:"hidden"}}>
   <div style={{position:"absolute",inset:0,opacity:.14,backgroundImage:"linear-gradient(#ffffff18 1px,transparent 1px),linear-gradient(90deg,#ffffff18 1px,transparent 1px)",backgroundSize:"54px 54px"}}/>
   <CategoryVisual kind={kind} theme={theme} index={index}/>
   <div style={{position:"absolute",left:"7%",right:"7%",top:"8%",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <div style={{fontSize:20,fontWeight:900,letterSpacing:4,color:theme.c}}>{theme.label}</div><div style={{fontSize:18,letterSpacing:3,color:"#ffffff99"}}>{String(index+1).padStart(2,"0")} / {String(total).padStart(2,"0")}</div>
   </div>
   <div style={{position:"absolute",left:"7%",right:kind==="product"?"43%":"7%",top:"30%",transform:`translateY(${y}px)`,textShadow:"0 8px 28px #000b"}}>
    <div style={{width:90,height:7,background:theme.a,borderRadius:9,marginBottom:26,boxShadow:`0 0 24px ${theme.a}`}}/>
    <div style={{fontSize:text.length>70?34:text.length>42?43:58,fontWeight:900,lineHeight:1.12,overflowWrap:"anywhere"}}>{text}</div>
    {index===0?<div style={{marginTop:26,fontSize:21,fontWeight:700,letterSpacing:2,color:theme.c}}>WATCH • LEARN • DISCOVER</div>:null}
   </div>
   <div style={{position:"absolute",left:"7%",right:"7%",bottom:"7%",height:7,background:"#ffffff26",borderRadius:9,overflow:"hidden"}}><div style={{height:"100%",width:`${clamp(frame/Math.max(1,durationInFrames))*100}%`,background:`linear-gradient(90deg,${theme.a},${theme.c})`,borderRadius:9}}/></div>
  </AbsoluteFill>
 </Sequence>;
}
export const FactoryVideo=({title="AI Content Factory",script="",audioUrl="",musicUrl="",musicStartSeconds=0,musicDurationSeconds=25,spotifyUrl="",artist="",durationSeconds=45})=>{
 const {fps,durationInFrames}=useVideoConfig();
 const clean=String(script||"").replace(/\s+/g," ").trim();
 const words=clean.split(" ").filter(Boolean);
 const chunks=[];const chunkSize=Math.max(8,Math.ceil(words.length/6));
 for(let i=0;i<words.length;i+=chunkSize)chunks.push(words.slice(i,i+chunkSize).join(" "));
 const kind=detectCategory(title,script,musicUrl);const theme=THEMES[kind];
 const scenes=[title,...chunks].slice(0,7);
 return <AbsoluteFill>
  {scenes.map((s,i)=><Scene key={i} text={s} index={i} total={scenes.length} kind={kind} theme={theme} title={title}/>)}
  {audioUrl?<Audio src={audioUrl} volume={musicUrl ? 0.55 : 1}/>:null}
  {musicUrl?<Audio src={musicUrl} volume={audioUrl ? 0.42 : 1} startFrom={Math.round(Number(musicStartSeconds||0)*fps)} endAt={Math.round((Number(musicStartSeconds||0)+Number(musicDurationSeconds||25))*fps)}/>:null}
  {musicUrl?<AbsoluteFill style={{justifyContent:"flex-end",padding:"0 7% 13%",pointerEvents:"none"}}><div style={{alignSelf:"center",textAlign:"center",background:"linear-gradient(135deg,#090b18eF,#35124deF)",border:"2px solid #ffd166aa",borderRadius:28,padding:"22px 34px",maxWidth:"86%",color:"#fff",fontFamily:"Arial,sans-serif",boxShadow:"0 0 55px #ff4f9155"}}><div style={{fontSize:34,fontWeight:900,color:"#ffd166"}}>♫ ORIGINAL RELEASE</div><div style={{fontSize:42,fontWeight:900,marginTop:8}}>{title}</div><div style={{fontSize:25,opacity:.9,marginTop:8}}>{artist}</div><div style={{fontSize:20,opacity:.8,marginTop:10}}>LISTEN • SAVE • SHARE</div></div></AbsoluteFill>:null}
 </AbsoluteFill>;
};
export const FACTORY_FPS=30;export const FACTORY_WIDTH=1920;export const FACTORY_HEIGHT=1080;export const FACTORY_DURATION_SECONDS=45;
