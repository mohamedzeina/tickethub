import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';
import { ticketCard, CardRow } from './card';
import { money, orderRef, longDate } from './format';

export interface ReceiptDetails {
	to: string;
	ticketTitle: string;
	price: number; // per-seat price, in dollars
	// Multi-seat (#10): number of seats. The amount charged is price * quantity.
	// Optional so a single-seat caller (or replay) defaults to 1.
	quantity?: number;
	orderId: string;
	stripeId: string;
	paidAt?: Date;
}

// "Admit One" styled purchase confirmation.
export const purchaseReceiptEmail = (d: ReceiptDetails): MailMessage => {
	const paid = longDate(d.paidAt ?? new Date());
	const ref = orderRef(d.orderId);
	const qty = d.quantity ?? 1;
	const total = d.price * qty;

	const text = [
		`You're in — payment confirmed.`,
		``,
		`Event:   ${d.ticketTitle}`,
		...(qty > 1 ? [`Seats:   ${qty} × ${money(d.price)}`] : []),
		`Amount:  ${money(total)}`,
		`Order:   No. ${ref}`,
		`Paid:    ${paid}`,
		`Stripe:  ${d.stripeId}`,
		``,
		`Show this confirmation at the gate. — TicketHub`,
	].join('\n');

	const rows: CardRow[] = [
		...(qty > 1
			? [{ label: 'SEATS', value: `${qty} &times; ${money(d.price)}` }]
			: []),
		{
			label: 'AMOUNT',
			value: money(total),
			valueStyle: 'color:#c0392b;font-weight:bold;',
		},
		{ label: 'ORDER', value: `No. ${escapeHtml(ref)}` },
		{ label: 'PAID', value: paid },
		{
			label: 'STRIPE REF',
			value: escapeHtml(d.stripeId),
			valueStyle: 'font-size:11px;',
		},
	];

	return {
		to: d.to,
		subject: `Your TicketHub receipt — ${d.ticketTitle}`,
		html: ticketCard({
			accent: '#c0392b',
			eyebrow: 'Admit One · Payment Confirmed',
			heading: d.ticketTitle,
			rows,
			footer: `Show this confirmation at the gate. Thanks for buying fan-to-fan on <b>TicketHub</b>.`,
		}),
		text,
	};
};
