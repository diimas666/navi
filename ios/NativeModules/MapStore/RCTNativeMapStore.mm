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

- (NSString *)directory {
  return MapStore.shared.directory.path;
}

- (void)fileBytes:(NSString *)name
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
  resolve(@([MapStore.shared fileBytes:name]));
}

- (void)download:(NSString *)url
            name:(NSString *)name
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
  [MapDownloads.shared start:url
                        name:name
                     resolve:^(double bytes) {
                       resolve(@(bytes));
                     }
                      reject:^(NSString *message) {
                        reject(@"MAP_DOWNLOAD", message, nil);
                      }];
}

- (NSNumber *)downloadProgress:(NSString *)name {
  return @([MapDownloads.shared fraction:name]);
}

- (void)cancelDownload:(NSString *)name {
  [MapDownloads.shared cancel:name];
}

- (void)query:(NSString *)name
          sql:(NSString *)sql
       params:(NSString *)params
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *rows = [MapDatabase.shared query:name sql:sql params:params];
    resolve(rows == nil ? [NSNull null] : rows);
  });
}

- (void)closeDatabase:(NSString *)name {
  [MapDatabase.shared close:name];
}

@end
