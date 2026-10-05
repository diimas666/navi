#import <React/RCTBridgeModule.h>
#import "../Support/NeivObjCImports.h"
#import "Neiv-Swift.h"

@interface RCTSpeechDictation : NSObject <RCTBridgeModule>
@end

@implementation RCTSpeechDictation

RCT_EXPORT_MODULE(SpeechDictation);

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_METHOD(listen:(NSString *)language
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [SpeechDictation.shared listen:language completion:^(NSString *text, NSString *error) {
    if (text.length > 0) {
      resolve(text);
      return;
    }
    reject(error ?: @"empty", error ?: @"empty", nil);
  }];
}

RCT_EXPORT_METHOD(stop) {
  [SpeechDictation.shared stop];
}

@end
