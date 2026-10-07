import {useEffect, useRef, useState} from 'react';
import {AppState, Linking} from 'react-native';

import {fetchStoreUpdate, shouldOfferUpdate, type StoreUpdate} from '../services/appUpdate';
import {loadUpdateSnooze, snoozeUpdate} from '../services/appUpdateStore';
import {useMapStore} from '../store/mapStore';
import {useSessionStore} from '../store/sessionStore';
import {useSettingsStore} from '../store/settingsStore';

export function useAppUpdate(): {
  offer: StoreUpdate | null;
  updateNow: () => void;
  updateLater: () => void;
} {
  const [offer, setOffer] = useState<StoreUpdate | null>(null);
  const skipped = useRef<string | null>(null);
  const online = useMapStore(state => state.online);
  const hydrated = useSettingsStore(state => state.hydrated);
  const onboarded = useSettingsStore(state => state.onboarded);
  const driving = useSessionStore(state => state.driving);

  useEffect(() => {
    if (!hydrated || !onboarded || !online || driving || offer) {
      return;
    }
    let alive = true;
    const check = () => {
      if (useSessionStore.getState().driving) {
        return;
      }
      Promise.all([fetchStoreUpdate(), loadUpdateSnooze()])
        .then(([store, snooze]) => {
          if (!alive || !store || skipped.current === store.version || !shouldOfferUpdate(store, snooze)) {
            return;
          }
          setOffer(store);
        })
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        check();
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [driving, hydrated, offer, onboarded, online]);

  return {
    offer,
    updateNow: () => {
      if (!offer) {
        return;
      }
      Linking.openURL(offer.storeUrl).catch(() => undefined);
    },
    updateLater: () => {
      if (offer) {
        skipped.current = offer.version;
        snoozeUpdate(offer.version).catch(() => undefined);
      }
      setOffer(null);
    },
  };
}
