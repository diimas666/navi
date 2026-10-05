import {TurboModuleRegistry, type TurboModule} from 'react-native';

export type NativeDRInput = {
  timestamp: number;
  trust: string;
  allowIntegration: boolean;
  hasGps: boolean;
  latitude: number;
  longitude: number;
  accuracy: number;
  hasGpsSpeed: boolean;
  gpsSpeed: number;
  hasGpsHeading: boolean;
  gpsHeading: number;
  hasVehicleSpeed: boolean;
  vehicleSpeedMps: number;
  hasHeading: boolean;
  heading: number;
  headingAccuracy: number;
  hasYawRate: boolean;
  yawRate: number;
};

export type NativeDROutput = {
  valid: boolean;
  latitude: number;
  longitude: number;
  heading: number;
  accuracy: number;
  confidence: number;
  distanceSinceGPS: number;
  timeSinceGPS: number;
  source: string;
};

export interface Spec extends TurboModule {
  reset(): void;
  step(input: NativeDRInput): Promise<NativeDROutput>;
}

export default TurboModuleRegistry.get<Spec>('NativeDeadReckoningEngine');
