import mongoose from 'mongoose';

// One row per in-app notification shown in a user's feed. Created by the event
// listeners; read back by the REST API (the navbar bell + /notifications page).

export enum NotificationType {
	OrderCreated = 'order_created',
	PaymentSucceeded = 'payment_succeeded',
	PaymentRefunded = 'payment_refunded',
	HoldExpiring = 'hold_expiring',
	HoldExpired = 'hold_expired',
	// Seller-side (#11)
	TicketSold = 'ticket_sold',
	SaleRefunded = 'sale_refunded',
	PayoutPaid = 'payout_paid',
	PayoutHeld = 'payout_held',
	// Buyer: admission pass scanned at the gate
	PassScanned = 'pass_scanned',
	// Wishlists (#16): a saved listing dropped in price.
	PriceDrop = 'price_drop',
	// Wishlists (#16): a saved listing became buyable again (relisted / freed).
	WishlistAvailable = 'wishlist_available',
	// Seller: a buyer left them a review (#9 — previously parked).
	ReviewReceived = 'review_received',
}

export interface NotificationAttrs {
	userId: string;
	type: NotificationType;
	title: string;
	body: string;
	orderId?: string;
	ticketId?: string;
}

interface NotificationDoc extends mongoose.Document {
	userId: string;
	type: NotificationType;
	title: string;
	body: string;
	orderId?: string;
	// Link target for notifications that point at a listing (e.g. price drops)
	// rather than an order.
	ticketId?: string;
	read: boolean;
	createdAt: string;
	updatedAt: string;
}

interface NotificationModel extends mongoose.Model<NotificationDoc> {
	build(attrs: NotificationAttrs): NotificationDoc;
}

const notificationSchema = new mongoose.Schema<NotificationDoc>(
	{
		userId: { type: String, required: true },
		type: { type: String, required: true },
		title: { type: String, required: true },
		body: { type: String, required: true },
		orderId: { type: String, required: false },
		ticketId: { type: String, required: false },
		read: { type: Boolean, required: true, default: false },
	},
	{
		timestamps: true,
		toJSON: {
			transform(doc, ret: any) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

// Feed query: a user's notifications, newest first.
notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.statics.build = (attrs: NotificationAttrs) => {
	return new Notification(attrs);
};

const Notification = mongoose.model<NotificationDoc, NotificationModel>(
	'Notification',
	notificationSchema,
);

export { Notification };
