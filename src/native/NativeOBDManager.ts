import {TurboModuleRegistry, type TurboModule} from 'react-native';

type EventEmitter<T> = (handler: (event: T) => void) => {remove(): void};

export type NativeOBDDevice = {
  id: string;
  name: string;
  transport: string;
  rssi: number;
};

export type NativeOBDState = {
  state: string;
  message: string;
};

export type NativeOBDSnapshot = {
  hasSpeed: boolean;
  speedKmh: number;
  hasRpm: boolean;
  rpm: number;
  hasEngineLoad: boolean;
  engineLoad: number;
  hasThrottle: boolean;
  throttle: number;
  hasCoolant: boolean;
  coolantC: number;
  hasVoltage: boolean;
  voltage: number;
  timestamp: number;
};

export interface Spec extends TurboModule {
  setTransport(transport: string): void;
  setWifiEndpoint(host: string, port: number): void;
  startScan(): void;
  stopScan(): void;
  connect(deviceId: string): Promise<boolean>;
  disconnect(): Promise<void>;
  getConnectionState(): Promise<string>;
  getDevices(): Promise<ReadonlyArray<NativeOBDDevice>>;
  getLatest(): Promise<NativeOBDSnapshot | null>;
  readonly onDevice: EventEmitter<NativeOBDDevice>;
  readonly onState: EventEmitter<NativeOBDState>;
  readonly onData: EventEmitter<NativeOBDSnapshot>;
}

export default TurboModuleRegistry.get<Spec>('NativeOBDManager');
