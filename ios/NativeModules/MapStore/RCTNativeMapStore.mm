#import "RCTNativeMapStore.h"
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@implementation RCTNativeMapStore

+ (NSString *)moduleName {
  return @"NativeMapStore";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMapStoreSpecJSI>(params);
}

- (void)saveText:(NSString *)name
        contents:(NSString *)contents
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
  resolve(@([MapStore.shared saveText:name contents:contents]));
}

- (void)readText:(NSString *)name
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
  NSString *text = [MapStore.shared readText:name];
  resolve(text == nil ? [NSNull null] : text);
}

- (void)remove:(NSString *)name
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
  resolve(@([MapStore.shared remove:name]));
}

@end
