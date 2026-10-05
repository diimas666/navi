import {TurboModuleRegistry, type TurboModule} from 'react-native';

type EventEmitter<T> = (handler: (event: T) => void) => {remove(): void};

export type NativeMotionSample = {
  hasHeading: boolean;
  heading: number;
  headingAccuracy: number;
  hasYawRate: boolean;
  yawRate: number;
  acceleration: number;
  timestamp: number;
};

export interface Spec extends TurboModule {
  start(): Promise<boolean>;
  stop(): void;
  isAvailable(): Promise<boolean>;
  getLatest(): Promise<NativeMotionSample | null>;
  readonly onMotion: EventEmitter<NativeMotionSample>;
}

export default TurboModuleRegistry.get<Spec>('NativeMotionManager');
