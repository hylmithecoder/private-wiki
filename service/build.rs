// The dashboard (`../out`, from `next build`) is embedded with rust-embed.
// Recompile whenever it changes, including when it first appears.
fn main() {
    println!("cargo:rerun-if-changed=../out");
    println!("cargo:rerun-if-changed=build.rs");
}
