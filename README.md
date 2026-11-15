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

## Source code publication status

**Documentation is available; the source export is pending security and licensing review.** This public repository does not yet contain the application source code. Do not treat it as a complete reproducible build.

The development repository remains private. Before publishing a clean source snapshot, the team will review the entire Git history and release files for secrets, private information, internal infrastructure references, third-party asset rights, license compatibility, and dependency vulnerabilities. The public snapshot must have a fresh history rather than importing the private development history.

The prototype is not clinically validated; no real patient information should be entered. The development application's private SQLite store does not provide encryption at rest.

## Project information

The prototype has benefited from AI-assisted development and testing. The team should disclose its actual tools and pre-challenge development timeline in the official submission.

Prepared 15 November 2026. For evaluation, begin with the live demo and PDF guide.
