import {TurboModuleRegistry, type TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  saveText(name: string, contents: string): Promise<boolean>;
  readText(name: string): Promise<string | null>;
  remove(name: string): Promise<boolean>;
  /** Absolute path of the maps folder, for `file://` and `pmtiles://file://` style URLs. */
  directory(): string;
  /** Size in bytes, -1 when the file is missing. */
  fileBytes(name: string): Promise<number>;
  /** Downloads into the maps folder. Resolves with the saved size. A broken download resumes next time. */
  download(url: string, name: string): Promise<number>;
  /** 0..1 while running, -1 when nothing runs under this name. */
  downloadProgress(name: string): number;
  cancelDownload(name: string): void;
}

export default TurboModuleRegistry.get<Spec>('NativeMapStore');
