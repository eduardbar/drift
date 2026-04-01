# Remotion workspace

This folder keeps motion-design work isolated from the CLI source in `src/`.

## Files

- `index.ts`: Remotion entry point registered by `remotion.config.ts`
- `Root.tsx`: composition registry
- `compositions/DriftReadmeDemo.tsx`: README-focused product demo composition (GIF)
- `compositions/DriftMarketingPulse.tsx`: starter marketing composition
- `tsconfig.json`: local TypeScript config for Remotion-only authoring

## Commands

- `npm run video:studio`: open Remotion Studio
- `npm run video:list`: list registered compositions
- `npm run video:render:promo`: render the starter square promo to `out/`
- `npm run video:render:readme-gif`: render the README demo GIF to `assets/readme/drift-demo.gif`

## Notes

- The root `tsconfig.json` stays focused on the CLI and still only includes `src/**/*`.
- Use this workspace for social clips, product teasers, or launch visuals without mixing video code into the analyzer source tree.
