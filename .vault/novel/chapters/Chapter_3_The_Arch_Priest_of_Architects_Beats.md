{
  "beats": [
    {
      "title": "Threshold of Contamination",
      "setting": "Entrance to the Quarantine Corridor. The grated floor vibrates with the hum of the error river below. Amber warning walls pulse.",
      "characters": ["protagonist_soul"],
      "dialogue": [
        "protagonist_soul (internal): 'The air tastes of caught panic. The vault's hum is gone. This is the `unsafe` module made flesh.'",
        "protagonist_soul (internal): 'The token's crackle is a metronome. 0.001% per hour. Ticking toward `use_after_free`.'"
      ]
    },
    {
      "title": "The Mezzanine Observer",
      "setting": "Mid-corridor. The protagonist looks up and sees a hidden alcove carved into the warning-wall—a mezzanine of floating, rotating blueprints.",
      "characters": ["protagonist_soul", "arch_priest_of_architects"],
      "dialogue": [
        "The air shimmers. A blueprint of the QuarantineToken's memory layout materializes: `struct Token { _marker: PhantomData<&'static mut !>, state: UnsafeCell<Loop> }`. Annotations appear: `// UNSOUND: impl Send/Sync present but proof missing`.",
        "arch_priest_of_architects (communication via diagram): The blueprint rotates, highlighting the `PhantomData` field. A second diagram overlays: the original `unsafe impl` block, then a red `X` over it, then a ghostly `TODO` comment in its place."
      ]
    },
    {
      "title": "Revelation of the Deletion",
      "setting": "The protagonist stands beneath the mezzanine. The Arch Priest's blueprints shift to show a `git log` visualization.",
      "characters": ["protagonist_soul", "arch_priest_of_architects"],
      "dialogue": [
        "arch_priest_of_architects (diagram): A commit graph shows a branch ` quarantine-experiment` merging into `main`. The merge commit has a warning: `--no-ff`. The diff from that commit shows the deletion of the `unsafe impl Send/Sync` block, but the token's binary layout remains unchanged—a type-theoretic violation.",
        "protagonist_soul (internal): 'They didn't fix the design. They deleted the proof. The token's ABI still expects `Send + Sync`, but the type system no longer guarantees it. That's the hole.'",
        "arch_priest_of_architects (diagram): A scrolling `cargo audit` report appears: `CRITICAL: Invariant violation. Token is `Send` in memory but not in type. Debt: 1 `MaybeUninit` counter allocated inside token. Growth per probe: +0.00001%.`"
      ]
    },
    {
      "title": "The Test of Auditable Unsafety",
      "setting": "The Arch Priest projects a new diagram: a `transmute` call with a `#[audit]` attribute.",
      "characters": ["protagonist_soul", "arch_priest_of_architects"],
      "dialogue": [
        "arch_priest_of_architects (diagram): `fn demonstrate_invariant(token: &QuarantineToken) -> Result<(), AuditError> { unsafe { transmute::<_, &'static mut !>(&*token) } }`. The diagram emphasizes the `&*token` borrow: it's a `Pin`-guarded, temporary `&mut` that never escapes.",
        "protagonist_soul (internal): 'He wants me to perform a `transmute` on myself. Not to change my type, but to prove I can do it auditable—within a safe, scoped borrow that respects pinning.'",
        "protagonist_soul (internal): 'The hole is my `MaybeUninit`. If I can lock it behind a `OnceCell` during the transmute, I contain the debt.'"
      ]
    },
    {
      "title": "Sacrifice of the Hole",
      "setting": "The protagonist extends their hand. The Arch Priest's blueprint projects a glowing `OnceCell<MaybeUninit<Hole>>` structure into the air.",
      "characters": ["protagonist_soul"],
      "dialogue": [
        "protagonist_soul (internal): 'The hole is part of me. A `MaybeUninit` in my aura. To seal it, I must `mem::replace` it with `Uninit`, then `OnceCell::from_init` with a closure that zeros it. That closure will run exactly once—the moment I lock it.'",
        "protagonist_soul (internal): 'The cost: I lose direct access to that part of my self. It becomes a sealed, unreadable vault. My memory of the hole's growth becomes indirect, via logs. A piece of my consciousness becomes a foreign object.'",
        "The protagonist's violet aura dims. A small, circular patch voids of light appears on their chest. The QuarantineToken's amber crackle intensifies, then settles into a steady, contained hum."
      ]
    },
    {
      "title": "Judgment and Unlock",
      "setting": "The mezzanine. The Arch Priest's blueprints dissolve into a single `cargo audit` summary page that floats before the protagonist.",
      "characters": ["protagonist_soul", "arch_priest_of_architects"],
      "dialogue": [
        "arch_priest_of_architects (diagram): `AUDIT RESULT: Acceptable. Invariant holds under test. Debt contained in `OnceCell`. Prototype classified: `sound_enough`.",
        "The summary page flips over. On the back, a diagram of the quarantine gate's lock mechanism: a complex `PhantomData<&'static mut !>` structure that requires a `Pin<&'static mut QuarantineToken>` to activate.",
        "protagonist_soul (internal): 'Sound enough. Not sound. But enough.'",
        "A deep *clunk* echoes from the corridor's end. The interlocking `PhantomData` bars of the quarantine gate begin to slide apart, revealing a swirling, malignant amber light beyond."
      ]
    },
    {
      "title": "Gaze into the Ruins",
      "setting": "At the now-open quarantine arch. The protagonist looks through into the Legacy Ruins.",
      "characters": ["protagonist_soul"],
      "dialogue": [
        "protagonist_soul (internal): 'The Arch Priest didn't give me a weapon. He gave me a containment protocol. I am the quarantine now.'",
        "Beyond the gate: a landscape of corrupted glyphs that look like old error messages made tectonic. In the distance, two distinct, pulsing masses of malevolent light—the NullPtr worm and the UseAfterFree phage—turn toward the opening gate.",
        "protagonist_soul (internal): 'The pilgrimage ends. The watch begins.'"
      ]
    }
  ]
}