import {TurboModuleRegistry, type TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  saveText(name: string, contents: string): Promise<boolean>;
  readText(name: string): Promise<string | null>;
  remove(name: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('NativeMapStore');
