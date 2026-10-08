# Chord Chemist

**Open the app:** https://theaminstitute-commits.github.io/chord-chemist/

A guitar chord-progression workbench built on common jazz-harmony rules.
Pick a progression (ii–V–I, I–vi–ii–V, blues…) and a starting chord. Each bar's directory then
lists only the chords that are legal in that bar, given the chord that follows:

| Directory | Rule |
|---|---|
| Diatonic | Any extension whose tones stay in the key (dominants use their own mixolydian) |
| Altered | Altered dominants, only when the next chord is a 4th higher or a half-step lower |
| Substitutes | Chords sharing notes (Dm7 = F6, Bm7♭5 = G9 no root…), tritone subs, +11 subs, dominants a minor third apart, backdoor/IVm |
| Secondary dominants | V7 of the next chord, and its tritone substitute |
| Passing chord ½ | Second-half-of-the-bar chords that lead into the next bar (related ii, V7/x, passing diminished, augmented) |

Change a later bar and any earlier chord that no longer resolves is struck through.

Voicings are generated systematically: 3 or 4 chord tones on a string set, every inversion up
the neck, filtered to what a hand can reach, plus E- and A-form barres. "Smooth voicings"
re-picks them so the hand moves as little as possible. Playback uses sampled jazz guitar
(see samples/NOTICE.md) or a synthesised choir (detuned sawtooths through the vowel's formant
filters, with delayed vibrato and a long hall).
The loading-screen art is a placeholder drawn by tools/placeholder-lab.py --light and dithered to
the light theme's four colours by tools/cga-splash.py; the loading screen is light in both themes.

**Backing tracks.** Store the chart in one of four banks (A–D), each with its own tempo and a
×1–×8 repeat count; play a bank, or the whole set in order (itself ×1–×8), and export the set as
an MP3 (lamejs, LGPL) or a 16-bit WAV with an optional one-bar count-in and metronome, to solo
over outside the app. The track is rendered offline with the same sound as playback. The Android
app writes it to Download/Chord Chemist; browsers save it to their Downloads folder.

## Layout

```
src/theory.js     chord formulas, keys, progression templates, legality rules
src/voicings.js   voicing generator and voice-leading choice
src/audio.js      sampled guitar, formant choir, playback scheduler, offline rendering
src/app.js        UI: directory, chart, diagrams, fretboard, drag & drop
src/banks.js      backing-track banks: store, play and export the chart
src/style.css     vintage card-catalog look (light + dark)
build.js          inlines everything into dist/chord-chemist.html (fonts embedded, works offline)
linux/            launcher, installer, and build-packages.sh (.deb + single-file .run)
android/          WebView wrapper + build-apk.ps1 (no Gradle): dist/ChordChemist-v<ver>-test.apk
samples/          jazz guitar samples (FluidR3 GM, CC BY 3.0 - see samples/NOTICE.md), embedded by build.js
vendor/lamejs/    MP3 encoder (lamejs 1.2.1, LGPL-3.0), embedded by build.js
test/             node test/theory.test.js
```

## Build

```bash
node test/theory.test.js
node build.js
sh linux/build-packages.sh   # on Linux or WSL: dist/*.deb and dist/ChordChemist.run
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1 -Version 0.1 -Code 1
```

The single-file `dist/chord-chemist.html` is also what an Android WebView wrapper would load.
Drag and drop uses pointer events (not HTML5 drag events), so it will work on touch screens.
