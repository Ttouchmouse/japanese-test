import audioCuesData from "../data/audio-cues.json";

export interface AudioCue {
  sourceItemId: string;
  src: string;
  audioFile: string;
  start: number;
  end: number;
  confidence: "high" | "review";
}

interface AudioCueFile {
  version: number;
  cues: AudioCue[];
}

export const audioCues = (audioCuesData as AudioCueFile).cues;

const cuesBySourceItemId = new Map(
  audioCues.map((cue) => [cue.sourceItemId, cue]),
);

export function audioCueFor(sourceItemId: string): AudioCue | undefined {
  return cuesBySourceItemId.get(sourceItemId);
}

