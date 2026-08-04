import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';
import { ticketCard, CardRow } from './card';
import { money, orderRef, longDate } from './format';

// 6-tail — a paid order was cancelled and the charge refunded. Confirms the
// money is on its way back. Mirrors the receipt layout but in a calm green.
export interface RefundDetails {
	to: string;
	ticketTitle: string;
	orderId: string;
	price?: number; // per-seat price, in dollars; omitted on a pre-price replay
	// Multi-seat (#10): number of seats refunded. The amount is price * quantity.
	// Optional so a single-seat caller (or replay) defaults to 1.
	quantity?: number;
	stripeId: string;
	refundedAt?: Date;
}

export const refundEmail = (d: RefundDetails): MailMessage => {
	const refunded = longDate(d.refundedAt ?? new Date());
	const ref = orderRef(d.orderId);
	const qty = d.quantity ?? 1;
	const total = d.price != null ? d.price * qty : null;
	const amountText = total != null ? money(total) : 'your payment';

	const text = [
		`Your refund is on its way.`,
		``,
		`Event:   ${d.ticketTitle}`,
		...(d.price != null && qty > 1 ? [`Seats:   ${qty} × ${money(d.price)}`] : []),
		...(total != null ? [`Amount:  ${money(total)}`] : []),
		`Order:   No. ${ref}`,
		`Refunded: ${refunded}`,
		`Stripe:  ${d.stripeId}`,
		``,
		`Refunds typically take 5–10 business days to appear on your statement. — TicketHub`,
	].join('\n');

	const rows: CardRow[] = [
		...(d.price != null && qty > 1
			? [{ label: 'SEATS', value: `${qty} &times; ${money(d.price)}` }]
			: []),
		...(total != null
			? [
					{
						label: 'AMOUNT',
						value: money(total),
						valueStyle: 'color:#2e7d4f;font-weight:bold;',
					},
			  ]
			: []),
		{ label: 'ORDER', value: `No. ${escapeHtml(ref)}` },
		{ label: 'REFUNDED', value: refunded },
		{
			label: 'STRIPE REF',
			value: escapeHtml(d.stripeId),
			valueStyle: 'font-size:11px;',
		},
	];

	return {
		to: d.to,
		subject: `Your TicketHub refund — ${d.ticketTitle}`,
		html: ticketCard({
			accent: '#2e7d4f',
			eyebrow: 'Admit One · Refund Issued',
			heading: d.ticketTitle,
			rows,
			footer: `We've refunded ${amountText} to your original payment method. It typically takes 5–10 business days to appear on your statement. Thanks for using <b>TicketHub</b>.`,
		}),
		text,
	};
};
