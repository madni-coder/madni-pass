#import <Foundation/Foundation.h>
#import <AuthenticationServices/AuthenticationServices.h>

@interface AppleSignInManager : NSObject <ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding>

+ (instancetype)sharedManager;
- (void)performSignInWithHashedNonce:(NSString *)hashedNonce;

@end
