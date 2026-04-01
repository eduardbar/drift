import {Composition} from 'remotion';

import {DriftMarketingPulse} from './compositions/DriftMarketingPulse';
import {DriftReadmeDemo} from './compositions/DriftReadmeDemo';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="DriftReadmeDemo"
        component={DriftReadmeDemo}
        durationInFrames={150}
        fps={30}
        width={1200}
        height={675}
      />
      <Composition
        id="DriftMarketingPulse"
        component={DriftMarketingPulse}
        durationInFrames={210}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};
