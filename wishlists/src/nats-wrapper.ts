// The implementation lives in @zeina-tickethub/common — all nine services had a
// byte-identical copy. Kept as a local module so the ~80 `from '../nats-wrapper'`
// imports and the sibling `__mocks__/nats-wrapper.ts` jest mock keep working.
export { natsWrapper } from '@zeina-tickethub/common';
