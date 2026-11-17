// The part of the stageshow kit (MIT, see LICENSE) the home page's signing
// demo uses, copied with its own imports. The full kit's barrel also pulls an
// icon library and brand artwork InkTap doesn't need. One local change:
// phone.tsx drops an unused import that this project's stricter tsconfig rejects.
export { Stage } from './stage'
export { useLook } from './looks'
export { Window, Bar, Text } from './window'
export { Phone } from './phone'
export { Fly } from './motion/Fly'
export { States } from './motion/States'
export { Button } from './controls/Button'
export type { Act } from './act'
