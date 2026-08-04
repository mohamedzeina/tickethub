import { makeFailedEventModel } from '@zeina-tickethub/common';

// Schema, unique index and the DeadLetterStore statics live in common; this
// registers the model on THIS service's mongoose instance.
export const FailedEvent = makeFailedEventModel();
