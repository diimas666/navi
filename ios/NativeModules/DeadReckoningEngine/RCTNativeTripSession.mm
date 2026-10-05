#import "RCTNativeTripSession.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeTripSession

- (instancetype)init {
  if (self = [super init]) {
    __weak RCTNativeTripSession *weakSelf = self;
    TripSession.shared.onSnapshot = ^(NSDictionary *snapshot) {
      [weakSelf emitOnSnapshot:snapshot];
    };
    TripSession.shared.onSessionError = ^(NSDictionary *error) {
      [weakSelf emitOnSessionError:error];
    };
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeTripSession";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeTripSessionSpecJSI>(params);
}

- (void)startPreview {
  [TripSession.shared startPreview];
}

- (void)stopPreview {
  [TripSession.shared stopPreview];
}

- (void)startNavigation:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [TripSession.shared startNavigation:^(BOOL ok) {
    resolve(@(ok));
  }];
}

- (void)stopNavigation {
  [TripSession.shared stopNavigation];
}

- (void)setDeadReckoningAllowed:(BOOL)allowed {
  [TripSession.shared setDeadReckoningAllowed:allowed];
}

- (void)setIgnoreGps:(BOOL)enabled {
  [TripSession.shared setIgnoreGps:enabled];
}

- (void)resetEstimator {
  [TripSession.shared resetEstimator];
}

- (void)speak:(NSString *)phrase language:(NSString *)language {
  [TripSession.shared speak:phrase language:language];
}

- (void)stopSpeaking {
  [TripSession.shared stopSpeaking];
}

@end
