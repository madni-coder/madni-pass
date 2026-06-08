#include "bindings/bindings.h"
#import <FirebaseCore/FirebaseCore.h>

int main(int argc, char * argv[]) {
	[FIRApp configure];
	ffi::start_app();
	return 0;
}
