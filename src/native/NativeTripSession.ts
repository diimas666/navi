import {TurboModuleRegistry, type TurboModule} from 'react-native';

type EventEmitter<T> = (handler: (event: T) => void) => {remove(): void};

export type NativeSnapshot = {
  navigationActive: boolean;
  drAllowed: boolean;
  trust: string;
  trustReason: string;
  hasGps: boolean;
  gpsLatitude: number;
  gpsLongitude: number;
  gpsAccuracy: number;
  gpsSpeed: number;
  gpsHeading: number;
  hasEstimate: boolean;
  latitude: number;
  longitude: number;
  heading: number;
  accuracy: number;
  confidence: number;
  distanceSinceGPS: number;
  timeSinceGPS: number;
  source: string;
  hasSpeed: boolean;
  speedMps: number;
  speedSource: string;
  motionQuality: string;
  obdQuality: string;
  timestamp: number;
};

export type NativeSessionError = {
  code: string;
  message: string;
};

export interface Spec extends TurboModule {
  startPreview(): void;
  stopPreview(): void;
  startNavigation(): Promise<boolean>;
  stopNavigation(): void;
  setDeadReckoningAllowed(allowed: boolean): void;
  setIgnoreGps(enabled: boolean): void;
  resetEstimator(): void;
  speak(phrase: string, language: string): void;
  stopSpeaking(): void;
  clipboardText(): Promise<string>;
  beginBackgroundWork(): void;
  endBackgroundWork(): void;
  readonly onSnapshot: EventEmitter<NativeSnapshot>;
  readonly onSessionError: EventEmitter<NativeSessionError>;
}

export default TurboModuleRegistry.get<Spec>('NativeTripSession');
