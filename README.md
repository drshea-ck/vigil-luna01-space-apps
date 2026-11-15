# VIGIL — Lunar Astronaut Health Companion

**NASA Space Apps Challenge 2026 | LUNA-01**

**VIGIL** (Vital Intelligence and Guidance for Interplanetary Life) is a human-centered research prototype exploring astronaut health monitoring and simulated medical support during lunar exploration.

**[Live demonstration](https://vigil-space-apps-2026.pages.dev/)** · **[Demo video](https://vigil-space-apps-2026.pages.dev/space-apps-demo.mp4)** · **[Project guide (PDF)](docs/VIGIL_Project_Guide_NASA_Space_Apps_2026.pdf)**

> **Public-release clarification:** The PDF describes the broader VIGIL research prototype, including its private, 25-passage NASA research corpus. **This public source release is a static browser demonstration containing nine source-verified NASA excerpts**, synthetic mission data, and deterministic educational responses. See [Public Release Notes](docs/PUBLIC_RELEASE_NOTES.md).

## Demonstrated features

- Fictional LUNA-01 mission, moving from Earth baselines through transit and lunar surface activities
- Personalized physiological observations and trends, crew views, mission timeline, and 3D interactive scenes with a visual fallback
- Four **simulated** support roles: Doctor, Nurse, Pharmacist, and Psychologist
- Nine verified NASA educational passages referenced by fixed topic matching in the public browser demo
- Synthetic records and tab-local interactions; no real patient data or operational medical telemetry

The simulated roles **do not** diagnose, prescribe, provide psychotherapy, determine medical fitness, or replace qualified healthcare professionals. The Earth-link blackout is a UI simulation. The public demo does not run a clinical AI model or access the private FastAPI/SQLite backend.

## Research sources

The broader research prototype examined NASA human-spaceflight risks. Sources included:

- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)
- [Hazard: Isolation and Confinement](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/)
- [The Human Body in Space](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)

The NASA excerpts are **educational reference material, not astronaut patient datasets**, and are not covered by the VIGIL source-code license. No NASA endorsement is implied.

## Build and test the public demo

Requires **Node.js 24** and npm. From the repository root:

```powershell
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend -- --mode space-apps
npm run preview --prefix frontend -- --port 4173 --strictPort
```

Open http://127.0.0.1:4173/ . For static hosting, serve `frontend/dist` and fall back to `index.html` for direct application routes such as `/companion`.

The build includes its synthetic fixtures; no production server, credentials, or private database is needed. Once built, the local demo can run without network access, although source/video links require internet access. Full 3D rendering requires browser WebGL2 support; the application includes a fallback for unsupported graphics.

The verification script is `scripts/demo/check_public.py`; it uses Playwright Chromium and may not complete 3D checks in environments where WebGL2 is unavailable.

## Future research vision — not implemented clinical capabilities

Possible directions include automated bone-health biomarker analysis, robotic ultrasound assessment of muscle, privacy-preserving reproductive-health support, task-specialized medical models, and clinician-supervised robotic medical-bay workflows. These require additional research, ethical review, clinical validation, and appropriate regulatory authorization.

## Scope, privacy and attribution

This is a **browser-only, synthetic demonstration**. The separate, private development prototype includes authenticated FastAPI/SQLite components and optional local Qwen inference, which are **not distributed here**. This release is not a clinically validated medical device. Do not enter patient data.

Contributors have authorized publication of their original project contributions, as confirmed by the project owner. The project owner approved **Apache License 2.0 for original VIGIL source code**. The [LICENSE](LICENSE) file contains its terms. NASA passages, third-party code, fonts and media retain their own applicable terms; see [ATTRIBUTION.md](ATTRIBUTION.md) and [PUBLIC_RELEASE_NOTES.md](docs/PUBLIC_RELEASE_NOTES.md).

The team reports creating its 3D assets with Claude-assisted Blender workflows and illustrations using AI-assisted workflows. ChatGPT and OpenAI Codex supported development and testing. Required organizer disclosures should be completed accurately in the challenge submission.
