export type NoteValue =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirty-second'
  | 'triplet-quarter'
  | 'triplet-eighth'
  | 'triplet-sixteenth'
  | 'free';

export interface ScaleDefinition {
  name: string;
  intervals: number[]; // semitone offsets from root, e.g. [0,2,4,5,7,9,11]
}

export interface XAxisConfig {
  domain: [number, number];   // x range to evaluate / display, in seconds
}

export interface YAxisConfig {
  scale: ScaleDefinition;
  rootNote: number;             // MIDI note 0-127 (root of scale, e.g. 60 = C4)
  yViewRange: [number, number]; // integer range displayed on the graph y-axis, e.g. [-8, 8]
}

export interface FunctionDef {
  id: string;
  name: string;
  expression: string;          // math.js expression, x is the free variable
  xAxis: XAxisConfig;
  yAxis: YAxisConfig;
  oneShotDuration: NoteValue;  // gate duration
  midiChannel: number;         // 1-16
  velocity: number;            // 0-127
  color: string;               // hex color for UI differentiation
}

export interface Chain {
  id: string;
  name: string;
  functionIds: string[];       // ordered list of function IDs, max 16
}

export type ManifoldItemType = 'function' | 'chain' | 'empty';

export interface ManifoldRow {
  midiChannel: number;          // slot identifier (1-16), immutable row key
  outputChannel: number;        // MIDI channel to send on (1-16), user-configurable
  outputDeviceId: string | null; // output device override; null = use global
  itemType: ManifoldItemType;
  itemId: string | null;
}

export interface Topology {
  id: string;
  name: string;
  createdAt: string;           // ISO timestamp
  functions: FunctionDef[];    // max 16
  chains: Chain[];             // max 16
  manifold: ManifoldRow[];     // 16 rows, indexed 0-15, midiChannel = index+1
  globalTempo: number;         // BPM
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
}

export interface TransportState {
  playing: boolean;
  paused: boolean;
  looping: boolean;
  externalClockActive: boolean;
  currentBpm: number;
  playheadX: number;           // current X position (for graph animation)
}

// A crossing event: the function crossed an integer boundary at this X
export interface CrossingEvent {
  x: number;
  fromDegree: number;
  toDegree: number;
}

// A raw sample point for graph rendering
export interface SamplePoint {
  x: number;
  y: number;
}
