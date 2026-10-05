#import "RCTNativeLocationManager.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeLocationManager

- (instancetype)init {
  if (self = [super init]) {
    __weak RCTNativeLocationManager *weakSelf = self;
    LocationManager.shared.onFix = ^(NSDictionary *fix) {
      [weakSelf emitOnFix:fix];
    };
    LocationManager.shared.onAuthorization = ^(NSString *status) {
      [weakSelf emitOnAuthorization:@{@"status": status}];
    };
  }
  return self;
}

- (void)emitOnFix:(NSDictionary *)value {
  if (_eventEmitterCallback) {
    _eventEmitterCallback("onFix", value);
  }
}

- (void)emitOnAuthorization:(NSDictionary *)value {
  if (_eventEmitterCallback) {
    _eventEmitterCallback("onAuthorization", value);
  }
}

- (void)emitOnError:(NSDictionary *)value {
  if (_eventEmitterCallback) {
    _eventEmitterCallback("onError", value);
  }
}

+ (NSString *)moduleName {
  return @"NativeLocationManager";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeLocationManagerSpecJSI>(params);
}

- (void)requestWhenInUse:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    [LocationManager.shared requestWhenInUse:^(NSString *status) {
      resolve(status);
    }];
  });
}

- (void)requestAlways:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    [LocationManager.shared requestAlways:^(NSString *status) {
      resolve(status);
    }];
  });
}

- (void)getAuthorizationStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve([LocationManager.shared authorizationStatus]);
  });
}

- (void)startUpdates:(BOOL)background {
  dispatch_async(dispatch_get_main_queue(), ^{
    [LocationManager.shared startUpdates:background];
  });
}

- (void)stopUpdates {
  dispatch_async(dispatch_get_main_queue(), ^{
    [LocationManager.shared stopUpdates];
  });
}

- (void)setBackgroundUpdates:(BOOL)enabled {
  dispatch_async(dispatch_get_main_queue(), ^{
    [LocationManager.shared setBackground:enabled];
  });
}

- (void)getLatestFix:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NSDictionary *fix = [LocationManager.shared latest];
  resolve(fix == nil ? [NSNull null] : fix);
}

@end
