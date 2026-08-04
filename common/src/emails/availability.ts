import { MailMessage } from '../mailer';
import { ticketCard, CardRow } from './card';
import { money } from './format';

// #16 wishlists — a listing the recipient saved is buyable again (relisted, or a
// hold on it expired). Nudges them back before it's gone. Mirrors the "Admit One"
// layout in a green "back on sale" accent.
export interface AvailabilityDetails {
	to: string;
	ticketTitle: string;
	ticketId: string;
	price: number;
	ticketUrl?: string;
}

export const availabilityEmail = (d: AvailabilityDetails): MailMessage => {
	const url = d.ticketUrl;

	const text = [
		`Good news — a ticket on your wishlist is available again.`,
		``,
		`Event:  ${d.ticketTitle}`,
		`Price:  ${money(d.price)}`,
		``,
		...(url ? [`Grab it: ${url}`, ``] : []),
		`Popular listings go fast — it may not last. — TicketHub`,
	].join('\n');

	const rows: CardRow[] = [
		{
			label: 'STATUS',
			value: 'Available again',
			valueStyle: 'color:#2e7d4f;font-weight:bold;',
		},
		{
			label: 'PRICE',
			value: money(d.price),
			valueStyle: 'font-size:16px;color:#211b16;',
		},
	];

	return {
		to: d.to,
		subject: `Back on sale — ${d.ticketTitle}`,
		html: ticketCard({
			accent: '#2e7d4f',
			eyebrow: 'Admit One · Back On Sale',
			heading: d.ticketTitle,
			rows,
			button: url ? { url, label: 'View the listing →' } : undefined,
			footer: `A ticket on your wishlist is back on the board. Popular listings go fast, so don't wait too long. Thanks for using <b>TicketHub</b>.`,
		}),
		text,
	};
};
