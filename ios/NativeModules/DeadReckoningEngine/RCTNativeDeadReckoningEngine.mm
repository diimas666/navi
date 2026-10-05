#import "RCTNativeDeadReckoningEngine.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeDeadReckoningEngine

+ (NSString *)moduleName {
  return @"NativeDeadReckoningEngine";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeDeadReckoningEngineSpecJSI>(params);
}

- (void)reset {
  [DeadReckoningEngine.shared reset];
}

- (void)step:(JS::NativeDeadReckoningEngine::NativeDRInput &)input
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject {
  NSDictionary *payload = @{
    @"timestamp" : @(input.timestamp()),
    @"trust" : input.trust(),
    @"allowIntegration" : @(input.allowIntegration()),
    @"hasGps" : @(input.hasGps()),
    @"latitude" : @(input.latitude()),
    @"longitude" : @(input.longitude()),
    @"accuracy" : @(input.accuracy()),
    @"hasGpsSpeed" : @(input.hasGpsSpeed()),
    @"gpsSpeed" : @(input.gpsSpeed()),
    @"hasGpsHeading" : @(input.hasGpsHeading()),
    @"gpsHeading" : @(input.gpsHeading()),
    @"hasVehicleSpeed" : @(input.hasVehicleSpeed()),
    @"vehicleSpeedMps" : @(input.vehicleSpeedMps()),
    @"hasHeading" : @(input.hasHeading()),
    @"heading" : @(input.heading()),
    @"headingAccuracy" : @(input.headingAccuracy()),
    @"hasYawRate" : @(input.hasYawRate()),
    @"yawRate" : @(input.yawRate()),
  };
  resolve([DeadReckoningEngine.shared step:payload]);
}

@end
