import { makeProcessedEventModel } from '@zeina-tickethub/common';

// Schema, unique index and the ProcessedEventStore statics live in common; this
// registers the model on THIS service's mongoose instance.
export const ProcessedEvent = makeProcessedEventModel();
