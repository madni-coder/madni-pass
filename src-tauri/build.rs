fn main() {
  // On iOS targets, compile and link the AppleSignInManager ObjC++ file
  // so that `ios_sign_in_with_apple` symbol is available to the Rust linker.
  let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
  if target_os == "ios" {
    compile_apple_sign_in();
  }

  tauri_build::build()
}

fn compile_apple_sign_in() {
  // Try multiple possible paths for the AppleSignInManager.mm file
  let possible_paths = [
    "gen/apple/Sources/app/AppleSignInManager.mm",
    "../gen/apple/Sources/app/AppleSignInManager.mm",
  ];

  let manifest_dir = std::path::PathBuf::from(
    std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string())
  );

  let mm_file = possible_paths
    .iter()
    .map(|p| manifest_dir.join(p))
    .find(|p| p.exists());

  if let Some(mm_file) = mm_file {
    let include_dir = mm_file.parent().unwrap();
    println!("cargo:warning=Compiling AppleSignInManager.mm from {:?}", mm_file);

    cc::Build::new()
      .file(&mm_file)
      .include(include_dir)
      .flag("-fobjc-arc")
      .flag("-std=c++14")
      .flag("-x")
      .flag("objective-c++")
      .compile("apple_sign_in");

    println!("cargo:rerun-if-changed={}", mm_file.display());
  } else {
    println!("cargo:warning=AppleSignInManager.mm not found — ios_sign_in_with_apple will be unresolved at link time");
  }
}
