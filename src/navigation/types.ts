export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Permissions: undefined;
  Home: undefined;
  Main: {screen?: keyof MainTabParamList} | undefined;
  Maps: undefined;
  Route: undefined;
  OBD: undefined;
  Adapters: undefined;
  Data: undefined;
  TripDetail: {tripId: string};
  Legal: {document: 'terms' | 'privacy'};
  Licenses: undefined;
  LicenseNotice: {id: string};
};

export type MainTabParamList = {
  Map: undefined;
  Trips: undefined;
  Settings: undefined;
};
