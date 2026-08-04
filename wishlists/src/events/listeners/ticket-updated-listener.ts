import {
	Listener,
	TicketUpdatedEvent,
	Subjects,
	processOnce,
	logger,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketRef } from '../../models/ticket-ref';
import { Wishlist } from '../../models/wishlist';
import { PriceDroppedPublisher } from '../publishers/price-dropped-publisher';
import { AvailablePublisher } from '../publishers/available-publisher';
import { natsWrapper } from '../../nats-wrapper';
import { isAvailable } from './is-available';

export class TicketUpdatedListener extends Listener<TicketUpdatedEvent> {
	readonly subject = Subjects.TicketUpdated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketUpdatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const ref = await TicketRef.findById(data.id);

			// No baseline yet (update arrived before create) — seed it and stop.
			// There's no prior price to compare against, so no drop to announce.
			if (!ref) {
				await TicketRef.build({
					id: data.id,
					title: data.title,
					price: data.price,
					version: data.version,
					sellerId: data.userId,
					unlisted: data.unlisted ?? false,
					available: isAvailable(data),
					eventDate: data.eventDate,
					venue: data.venue,
					imageUrl: data.imageUrl,
					category: data.category,
				}).save();
				return;
			}

			// Ignore stale / replayed updates so an out-of-order event can't
			// fabricate a phantom price change or availability flip.
			if (data.version <= ref.version) {
				return;
			}

			const oldPrice = ref.price;
			const newPrice = data.price;
			const wasAvailable = ref.available;
			const nowAvailable = isAvailable(data);

			// Apply the update to the replica.
			ref.title = data.title;
			ref.price = newPrice;
			ref.version = data.version;
			ref.unlisted = data.unlisted ?? false;
			ref.available = nowAvailable;
			if (data.eventDate !== undefined) ref.eventDate = data.eventDate;
			if (data.venue !== undefined) ref.venue = data.venue;
			if (data.imageUrl !== undefined) ref.imageUrl = data.imageUrl;
			if (data.category !== undefined) ref.category = data.category;
			await ref.save();

			// Two independent alerts: a price drop on an active listing, and a
			// listing becoming buyable again (relisted / hold freed). Both are rare
			// per event; fetch watchers once and fan out whichever fired.
			const dropped = newPrice < oldPrice && nowAvailable;
			const becameAvailable = !wasAvailable && nowAvailable;
			if (!dropped && !becameAvailable) return;

			const watchers = await Wishlist.find({ ticketId: data.id });
			if (!watchers.length) return;

			// Same fan-out both times: one event per watcher, sequentially, with
			// the watcher's captured identity plus whatever extra the alert carries.
			const fanOut = async (
				publisher: { publish: (payload: any) => Promise<unknown> },
				extra: Record<string, unknown>,
			) => {
				for (const w of watchers) {
					await publisher.publish({
						userId: w.userId,
						email: w.userEmail,
						ticketId: data.id,
						title: data.title,
						...extra,
					});
				}
			};

			if (dropped) {
				await fanOut(new PriceDroppedPublisher(natsWrapper.js), {
					oldPrice,
					newPrice,
				});
				logger.info(
					{ ticketId: data.id, oldPrice, newPrice, watchers: watchers.length },
					'price drop — notified watchers',
				);
			}

			if (becameAvailable) {
				await fanOut(new AvailablePublisher(natsWrapper.js), {
					price: newPrice,
				});
				logger.info(
					{ ticketId: data.id, watchers: watchers.length },
					'back available — notified watchers',
				);
			}
		});

		msg.ack();
	}
}
