# Fallback demo video procedure

This is the backup recording path for a buildathon presentation. It records
only the checked-in offline demo; no provider key, secret, or public network is
needed. Do not commit the resulting video or event capture unless the project
owner explicitly asks for a media artifact.

## Preferred recording: local viewer

Use a screen recorder such as OBS, the operating system's built-in recorder,
or another local tool that can capture one browser window and microphone audio.
The expected presentation path is the normal paced demo, approximately 75–95
seconds.

1. From the repository root, install into the project environment using the
   README quickstart. If the environment supports it, set
   `GRUDGE_OFFLINE=true` explicitly; the default demo is already offline.
2. Create a local, ignored staging directory for the recording:

   ```bash
   mkdir -p artifacts/phase12
   ```

3. Start the demo without opening a browser automatically:

   ```bash
   grudge demo --no-browser --port 8765
   ```

4. Open `http://127.0.0.1:8765/` in a local browser. Start recording, click
   **Replay**, and narrate the five beats from [`../pitch/demo_script.md`](../pitch/demo_script.md).
5. Stop after `demo.finished` appears and the regression comment is visible.
   Save the backup as `artifacts/phase12/grudge-demo.mp4` (or the recorder's
   native format if MP4 is unavailable).
6. Verify the file is playable and record its checksum next to it if the video
   is being transferred:

   ```bash
   sha256sum artifacts/phase12/grudge-demo.mp4
   ```

The viewer server and orchestrator use only checked-in fake tools, the sample
Scar, controls, and deterministic fallback synthesis. A browser or recorder is
needed only for capturing pixels; it is not part of the Grudge runtime.

## Headless fallback: record terminal/events

If the browser cannot be used, produce a deterministic event capture and record
the terminal or a slide deck that steps through the five beats:

```bash
mkdir -p artifacts/phase12
grudge demo --no-browser --fast --json > artifacts/phase12/grudge-events.json
```

The JSON contains the complete typed event list, fixed/vulnerable gate
summaries, and the `offline/deterministic` mode label. Play it back while
showing the shrink visual reference in [`../docs/assets/shrink.svg`](../docs/assets/shrink.svg)
and the event contract in [`../docs/viewer-events.md`](../docs/viewer-events.md).
Keep the JSON beside the recording as provenance, but do not edit event values
to make a result look better.

## Recovery notes

- If port `8765` is busy, choose another port and open the printed URL.
- If a run is interrupted, stop the command, restart it, and use **Replay** for
  a clean five-beat take.
- Use `--fast` only for the headless fallback or a smoke take; it removes the
  presenter pacing and is not the preferred visual recording.
- A failed demo is a recording concern, not a reason to invent benchmark or
  gate numbers. Preserve the command output and report the failure with the
  environment details.
