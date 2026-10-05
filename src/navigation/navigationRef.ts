import {createNavigationContainerRef} from '@react-navigation/native';

import type {RootStackParamList} from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openAdapterSetup(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.navigate('OBD');
}

export function openMap(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.navigate('Main', {screen: 'Map'});
}
