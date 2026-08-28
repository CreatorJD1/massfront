# Music catalog fixtures

`cases.json` drives `../test-music-catalog.mjs`. The test starts from the real
source catalog, verifies that its audit form is clean and its release form is
blocked, then applies one named mutation per failure class.

The fixtures deliberately never describe the current `mus_*` beds as approved.
The `approval-without-rights` mutation is an invalid test case whose required
result is a set of approval errors.

Run:

```text
node tools/audio-library/test-music-catalog.mjs
```

