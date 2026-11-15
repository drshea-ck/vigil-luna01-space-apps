# VIGIL — Lunar Astronaut Health Companion

**NASA Space Apps Challenge 2026 | LUNA-01**

VIGIL (Vital Intelligence and Guidance for Interplanetary Life) is a human-centered research prototype for health monitoring and simulated medical support during lunar exploration.

**Live public demonstration:** https://vigil-space-apps-2026.pages.dev/

**Project video:** https://vigil-space-apps-2026.pages.dev/space-apps-demo.mp4

**[Read the Project Guide (PDF)](docs/VIGIL_Project_Guide_NASA_Space_Apps_2026.pdf)**

## What the prototype demonstrates

- Fictional LUNA-01 mission, from Earth baseline through transit and lunar surface
- Personalized physiological baselines, trends, and crew observations
- Simulated Doctor, Nurse, Pharmacist, and Psychologist support modes
- Educational, reviewed NASA source excerpts in the full development prototype
- Offline-first design goals and continuity-of-care workflows

All crew and measurements are **synthetic**. Medical roles are simulated and do not diagnose, prescribe, provide psychotherapy, or replace clinicians. The public static demo may not reproduce every local model-backed capability.

## NASA resources incorporated into the research corpus

- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)
- [Hazard: Isolation and Confinement](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/)
- [The Human Body in Space](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)

These are educational NASA references, **not astronaut patient datasets**.

## Future vision — not implemented clinical capabilities

Research possibilities include automated bone-health biomarkers, robotic ultrasound muscle assessment, privacy-preserving reproductive-health support, specialized AI models, and eventually clinically validated, human-supervised robotic medical-bay workflows.

## Build and run the judging demonstration

Requires Node.js 24 and npm. Use the Space Apps build mode for the login-free, synthetic demonstration.

```powershell
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend -- --mode space-apps
npm run preview --prefix frontend -- --port 4173 --strictPort
```

Open `http://127.0.0.1:4173/`. For static hosting, serve `frontend/dist` and route direct application paths such as `/companion` to `index.html`. After dependencies are installed and assets built, the demo runs without an internet connection. Links to NASA originals and the public video require connectivity.

The React/TypeScript frontend uses Vite, Three.js and React Three Fiber. It loads synthetic mission fixtures and selects reviewed NASA excerpts using fixed topic matching. Four support modes illustrate observation review, check-ins, medication abstention and optional reflection. Session edits live in the tab and reset on reload. The authenticated FastAPI/SQLite application and optional local Qwen model remain part of the separate development prototype. See [attributions and asset review](ATTRIBUTION.md).

The prototype is not clinically validated; no real patient information should be entered. The development application's private SQLite store does not provide encryption at rest.

## Project information

The prototype has benefited from AI-assisted development and testing. The team should disclose its actual tools and pre-challenge development timeline in the official submission.

Prepared 15 November 2026. For evaluation, begin with the live demo and PDF guide.

## License scope

The proposed Apache-2.0 grant covers original VIGIL code. NASA excerpts, third-party components, fonts, media and the existing PDF retain their own status. See [attribution](ATTRIBUTION.md).
