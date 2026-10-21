import React from "react";
import {Composition, registerRoot} from "remotion";
import {FactoryVideo,FACTORY_FPS,FACTORY_WIDTH,FACTORY_HEIGHT,FACTORY_DURATION_SECONDS} from "./Root";

const Root=()=> <Composition
  id="FactoryVideo"
  component={FactoryVideo}
  width={FACTORY_WIDTH}
  height={FACTORY_HEIGHT}
  fps={FACTORY_FPS}
  durationInFrames={FACTORY_FPS*FACTORY_DURATION_SECONDS}
  calculateMetadata={({props})=>{
    const seconds=Math.max(1,Math.min(480,Number(props.durationSeconds)||FACTORY_DURATION_SECONDS));
    const ratio=String(props.aspectRatio||"16:9");
    const dimensions=ratio==="9:16"?{width:720,height:1280}:ratio==="1:1"?{width:720,height:720}:{width:1280,height:720};
    return {durationInFrames:FACTORY_FPS*seconds,...dimensions};
  }}
  defaultProps={{title:"AI Content Factory",script:"",audioUrl:"",musicUrl:"",musicStartSeconds:0,musicDurationSeconds:25,spotifyUrl:"",artist:"",durationSeconds:FACTORY_DURATION_SECONDS,category:"",aspectRatio:"16:9"}}
/>;

registerRoot(Root);
