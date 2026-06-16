#import "AppleSignInManager.h"

// Forward declaration of the Rust callback
extern "C" void rust_apple_sign_in_callback(const char* result_json, const char* error_str);

@implementation AppleSignInManager

+ (instancetype)sharedManager {
    static AppleSignInManager *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[self alloc] init];
    });
    return sharedInstance;
}

- (void)performSignInWithHashedNonce:(NSString *)hashedNonce {
    if (@available(iOS 13.0, *)) {
        ASAuthorizationAppleIDProvider *appleIDProvider = [[ASAuthorizationAppleIDProvider alloc] init];
        ASAuthorizationAppleIDRequest *request = [appleIDProvider createRequest];
        request.requestedScopes = @[ASAuthorizationScopeFullName, ASAuthorizationScopeEmail];
        
        if (hashedNonce && hashedNonce.length > 0) {
            request.nonce = hashedNonce;
        }
        
        ASAuthorizationController *controller = [[ASAuthorizationController alloc] initWithAuthorizationRequests:@[request]];
        controller.delegate = self;
        controller.presentationContextProvider = self;
        [controller performRequests];
    } else {
        rust_apple_sign_in_callback(nil, "Sign in with Apple is not supported on this iOS version.");
    }
}

#pragma mark - ASAuthorizationControllerDelegate

- (void)authorizationController:(ASAuthorizationController *)controller didCompleteWithAuthorization:(ASAuthorization *)authorization API_AVAILABLE(ios(13.0)) {
    if ([authorization.credential isKindOfClass:[ASAuthorizationAppleIDCredential class]]) {
        ASAuthorizationAppleIDCredential *credential = authorization.credential;
        
        NSString *userIdentifier = credential.user;
        NSString *email = credential.email;
        
        // Full Name details
        NSString *givenName = credential.fullName.givenName;
        NSString *familyName = credential.fullName.familyName;
        
        // Convert Identity Token to string
        NSString *identityTokenStr = nil;
        if (credential.identityToken) {
            identityTokenStr = [[NSString alloc] initWithData:credential.identityToken encoding:NSUTF8StringEncoding];
        }
        
        // Convert Authorization Code to string
        NSString *authCodeStr = nil;
        if (credential.authorizationCode) {
            authCodeStr = [[NSString alloc] initWithData:credential.authorizationCode encoding:NSUTF8StringEncoding];
        }
        
        NSMutableDictionary *resultDict = [NSMutableDictionary dictionary];
        if (userIdentifier) resultDict[@"userIdentifier"] = userIdentifier;
        if (email) resultDict[@"email"] = email;
        if (givenName) resultDict[@"givenName"] = givenName;
        if (familyName) resultDict[@"familyName"] = familyName;
        if (identityTokenStr) resultDict[@"identityToken"] = identityTokenStr;
        if (authCodeStr) resultDict[@"authorizationCode"] = authCodeStr;
        
        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:resultDict options:0 error:&error];
        if (!jsonData) {
            rust_apple_sign_in_callback(nil, "Failed to serialize Apple Sign-In credential.");
            return;
        }
        
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        rust_apple_sign_in_callback([jsonString UTF8String], nil);
    } else {
        rust_apple_sign_in_callback(nil, "Unsupported credential type returned.");
    }
}

- (void)authorizationController:(ASAuthorizationController *)controller didCompleteWithError:(NSError *)error API_AVAILABLE(ios(13.0)) {
    NSString *errorMsg = error.localizedDescription ?: @"Unknown error during Sign in with Apple";
    rust_apple_sign_in_callback(nil, [errorMsg UTF8String]);
}

#pragma mark - ASAuthorizationControllerPresentationContextProviding

- (ASPresentationAnchor)presentationAnchorForAuthorizationController:(ASAuthorizationController *)controller API_AVAILABLE(ios(13.0)) {
    UIWindow *window = nil;
    if (@available(iOS 13.0, *)) {
        for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
            if (scene.activationState == UISceneActivationStateForegroundActive && [scene isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *windowScene = (UIWindowScene *)scene;
                for (UIWindow *w in windowScene.windows) {
                    if (w.isKeyWindow) {
                        window = w;
                        break;
                    }
                }
            }
            if (window) {
                break;
            }
        }
    }
    if (!window) {
        window = [UIApplication sharedApplication].keyWindow;
    }
    return window;
}

@end

// Implementation of the C function declared in Rust
extern "C" {
    void ios_sign_in_with_apple(const char* hashed_nonce) {
        NSString *nonceStr = hashed_nonce ? [NSString stringWithUTF8String:hashed_nonce] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            [[AppleSignInManager sharedManager] performSignInWithHashedNonce:nonceStr];
        });
    }
}
