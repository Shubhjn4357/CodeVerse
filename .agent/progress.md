Original prompt: now create a fully imersive 3d enviroment whre is a offine and these many agent is worker and each agent has a its own real world job to earn coins "BIT" which they have to perform job complete real world task and earn moner and as for agent agent itself suggest work make discussion confference learn interpret and create ideas each agen has its own thinking approve them complete them complete full imresive workjob flow

- 2026-03-12: Started implementation plan for an offline "Workverse" simulation inside `dashboard/index.html`.
- Decision: keep the existing memory dashboard and add a new immersive panel instead of replacing the current UI.
- Decision: no external runtime dependencies; the 3D look will be rendered with local canvas code so the experience remains offline.
- TODO: add a dedicated `workverse.css` and `workverse.js`.
- TODO: wire `render_game_to_text` and `advanceTime(ms)` for deterministic testing.
- 2026-03-12: Pivoted from the static `dashboard/index.html` panel to a dedicated React + Three Fiber app in `dashboard/workverse-react/`.
- Decision: keep the old static dashboard intact and build the immersive world as a separate Vite entry so the simulation loop, memory sync, and 3D scene stay maintainable.
- Added root `package.json` and `dashboard/workverse-react/vite.config.js` with dev-time memory JSON serving and build-time copying into `dist/memory`.
- TODO: implement the Workverse simulation store, React shell, and Three Fiber scene.
