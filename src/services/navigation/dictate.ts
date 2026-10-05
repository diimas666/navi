import {NativeModules} from 'react-native';

type SpeechModule = {
  listen(language: string): Promise<string>;
  stop(): void;
};

const speech = NativeModules.SpeechDictation as SpeechModule | undefined;

export function dictate(language: 'uk' | 'ru'): Promise<string> {
  if (!speech?.listen) {
    return Promise.reject(new Error('unavailable'));
  }
  return speech.listen(language === 'ru' ? 'ru-RU' : 'uk-UA');
}

export function stopDictation(): void {
  speech?.stop?.();
}
