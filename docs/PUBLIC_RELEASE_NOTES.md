# VIGIL — Public source release notes (2026)

**Repository:** https://github.com/drshea-ck/vigil-luna01-space-apps  
**Public demonstration:** https://vigil-space-apps-2026.pages.dev/  
**Video:** https://vigil-space-apps-2026.pages.dev/space-apps-demo.mp4

## How to interpret the PDF guide

The [project guide](VIGIL_Project_Guide_NASA_Space_Apps_2026.pdf) includes the clinical motivation, lunar mission concept, technical research architecture, and long-term roadmap for VIGIL. Parts of it describe the **broader private research/development prototype**, not features included in the published source.

The **published source** is a standalone, login-free React/TypeScript static demonstration using fictional LUNA-01 mission fixtures, scene models, and deterministic, bounded educational support modes. It contains **nine source-verified NASA educational excerpts**. The private knowledge corpus had **25 collected NASA passages**, of which the reviewed decisions were 17 approved, five revise, three exclude; those numbers do **not** mean 25 passages are bundled in the public static release.

The public repository does not include the private FastAPI backend, persistent SQLite records, local Ollama/Qwen inference, server infrastructure, deployment secrets or any real medical information. Future automated lab testing, robotic ultrasound, reproductive healthcare and clinical diagnosis are **proposed research directions**, not working or validated features.

## Verification evidence and limitations

The published-source review reported: an independent install/build in `space-apps` mode, ten frontend tests passing, npm audit with zero advisories, and successful independent browser checks for six routes, four simulated support modes, mobile fallback, and zero API requests. The bundled Playwright 3D test could not complete in one verification environment because Chromium lacked **WebGL2**; this is not evidence of a failure of the deployed 3D scene. In that verification session, Gitleaks and Semgrep were **not installed**, so those scans are recorded as NOT RUN there; a preceding local release-candidate audit separately reported zero matches and findings. These checks do **not** constitute a guarantee of vulnerability-free software or a clinical security certification.

## License and attribution

Original VIGIL source code is licensed under **Apache-2.0**, approved by the project owner with contributor authorization confirmed. Third-party packages, fonts, NASA excerpts, and any other externally sourced materials retain their respective license and attribution obligations. The team reports AI-assisted, team-created 3D and illustration assets. See [ATTRIBUTION.md](../ATTRIBUTION.md) and [SECURITY.md](../SECURITY.md).

This page supplements the original PDF, it does not revise its preserved bytes.
