import {TurboModuleRegistry, type TurboModule} from 'react-native';

type EventEmitter<T> = (handler: (event: T) => void) => {remove(): void};

export type NativeFix = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  altitude: number;
  speed: number;
  heading: number;
  timestamp: number;
  hasSpeed: boolean;
  hasHeading: boolean;
};

export type NativeAuthEvent = {
  status: string;
};

export type NativeErrorEvent = {
  code: string;
  message: string;
};

export interface Spec extends TurboModule {
  requestWhenInUse(): Promise<string>;
  requestAlways(): Promise<string>;
  getAuthorizationStatus(): Promise<string>;
  startUpdates(background: boolean): void;
  stopUpdates(): void;
  setBackgroundUpdates(enabled: boolean): void;
  getLatestFix(): Promise<NativeFix | null>;
  readonly onFix: EventEmitter<NativeFix>;
  readonly onAuthorization: EventEmitter<NativeAuthEvent>;
  readonly onError: EventEmitter<NativeErrorEvent>;
}

export default TurboModuleRegistry.get<Spec>('NativeLocationManager');
