import {useEffect, useRef} from 'react';
import {Linking} from 'react-native';

import {uiCopy} from '../i18n/uiCopy';
import {openMap} from '../navigation/navigationRef';
import {resolveNavLink} from '../services/navigation/incomingLink';
import {useLinkStore} from '../store/linkStore';
import {useSettingsStore} from '../store/settingsStore';
import {useUiStore} from '../store/uiStore';

export function useIncomingNavLink(): void {
  const seen = useRef('');
  const hydrated = useSettingsStore(state => state.hydrated);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const apply = (url: string | null) => {
      if (!url || url === seen.current) {
        return;
      }
      seen.current = url;
      resolveNavLink(url)
        .then(place => {
          if (!place) {
            useUiStore.getState().showToast(uiCopy(useSettingsStore.getState().language).linkBad);
            return;
          }
          useLinkStore.getState().offer(place);
          openMap();
        })
        .catch(() => {
          useUiStore.getState().showToast(uiCopy(useSettingsStore.getState().language).linkBad);
        });
    };
    Linking.getInitialURL()
      .then(url => apply(url ?? null))
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', event => apply(event.url));
    return () => sub.remove();
  }, [hydrated]);
}
