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
  defaultProps={{title:"AI Content Factory",script:"",audioUrl:"",durationSeconds:FACTORY_DURATION_SECONDS}}
/>;

registerRoot(Root);
