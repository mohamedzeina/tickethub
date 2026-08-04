import { MailMessage } from '../mailer';
import { ticketCard, CardRow } from './card';
import { money } from './format';

// #16 wishlists — a listing the recipient saved dropped in price. Nudges them
// back to the listing. Mirrors the "Admit One" layout in a warm amber accent.
export interface PriceDropDetails {
	to: string;
	ticketTitle: string;
	ticketId: string;
	oldPrice: number;
	newPrice: number;
	ticketUrl?: string; // deep link to the listing (built from CLIENT_URL)
}

export const priceDropEmail = (d: PriceDropDetails): MailMessage => {
	const saved = Math.max(0, d.oldPrice - d.newPrice);
	const url = d.ticketUrl;

	const text = [
		`Good news — a ticket on your wishlist just dropped in price.`,
		``,
		`Event:    ${d.ticketTitle}`,
		`Was:      ${money(d.oldPrice)}`,
		`Now:      ${money(d.newPrice)}`,
		...(saved > 0 ? [`You save: ${money(saved)}`] : []),
		``,
		...(url ? [`View the listing: ${url}`, ``] : []),
		`Prices can change again at any time. — TicketHub`,
	].join('\n');

	const rows: CardRow[] = [
		{
			label: 'WAS',
			value: money(d.oldPrice),
			valueStyle: 'text-decoration:line-through;',
		},
		{
			label: 'NOW',
			value: money(d.newPrice),
			valueStyle: 'color:#b9791f;font-weight:bold;font-size:16px;',
		},
		...(saved > 0 ? [{ label: 'YOU SAVE', value: money(saved) }] : []),
	];

	return {
		to: d.to,
		subject: `Price drop — ${d.ticketTitle}`,
		html: ticketCard({
			accent: '#b9791f',
			eyebrow: 'Admit One · Price Drop',
			heading: d.ticketTitle,
			rows,
			button: url ? { url, label: 'View the listing →' } : undefined,
			footer: `A ticket on your wishlist just got cheaper. Prices can change again at any time. Thanks for using <b>TicketHub</b>.`,
		}),
		text,
	};
};
