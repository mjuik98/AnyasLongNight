// Behavioral regression checks with Lua 5.3 and explicit Warcraft native mocks.
// This does not emulate Warcraft rendering, its spatial-index cost, or ALICE timing.
// Usage: npm test [-- --input <test-map>]. Suites run in this order; each file imports
// the shared harness and mocks from build/check/.
import './check/harness.mjs';
import './check/suites-combat.mjs';
import './check/suites-growth.mjs';
import './check/suites-run.mjs';
import './check/suites-hud.mjs';
import './check/suites-story-ui.mjs';
import './check/suites-stage.mjs';
import './check/build-tools.mjs';
