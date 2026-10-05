#import "RCTNativeOBDManager.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeOBDManager

- (instancetype)init {
  if (self = [super init]) {
    __weak RCTNativeOBDManager *weakSelf = self;
    OBDManager.shared.onDevice = ^(NSDictionary *device) {
      [weakSelf emitOnDevice:device];
    };
    OBDManager.shared.onState = ^(NSDictionary *state) {
      [weakSelf emitOnState:state];
    };
    OBDManager.shared.onData = ^(NSDictionary *data) {
      [weakSelf emitOnData:data];
    };
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeOBDManager";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeOBDManagerSpecJSI>(params);
}

- (void)setTransport:(NSString *)transport {
  [OBDManager.shared setTransport:transport];
}

- (void)setWifiEndpoint:(NSString *)host port:(double)port {
  [OBDManager.shared setWifiEndpoint:host port:port];
}

- (void)startScan {
  [OBDManager.shared startScan];
}

- (void)stopScan {
  [OBDManager.shared stopScan];
}

- (void)connect:(NSString *)deviceId
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject {
  [OBDManager.shared connect:deviceId completion:^(BOOL ok) {
    resolve(@(ok));
  }];
}

- (void)disconnect:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [OBDManager.shared disconnect:^{
    resolve(nil);
  }];
}

- (void)getConnectionState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve([OBDManager.shared connectionState]);
}

- (void)getDevices:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve([OBDManager.shared deviceList]);
}

- (void)getLatest:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve([OBDManager.shared latest]);
}

@end
