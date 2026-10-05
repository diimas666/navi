#import "RCTNativeMotionManager.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeMotionManager

- (instancetype)init {
  if (self = [super init]) {
    __weak RCTNativeMotionManager *weakSelf = self;
    MotionManager.shared.onMotion = ^(NSDictionary *sample) {
      [weakSelf emitOnMotion:sample];
    };
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeMotionManager";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMotionManagerSpecJSI>(params);
}

- (void)start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve(@([MotionManager.shared start]));
}

- (void)stop {
  [MotionManager.shared stop];
}

- (void)isAvailable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve(@([MotionManager.shared available]));
}

- (void)getLatest:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NSDictionary *sample = [MotionManager.shared latest];
  resolve(sample == nil ? [NSNull null] : sample);
}

@end
