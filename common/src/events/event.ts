import { JSONCodec } from 'nats';
import { Subjects } from './subjects';

// The shape every event payload interface satisfies. Publisher<T> and
// Listener<T> are both constrained by it so a subject and its data type can't
// drift apart. Internal to this package — not re-exported from index.ts.
export interface Event {
	subject: Subjects;
	data: any;
}

// One codec shared by the publish and consume sides, so both agree on the
// wire encoding by construction.
export const jc = JSONCodec();
