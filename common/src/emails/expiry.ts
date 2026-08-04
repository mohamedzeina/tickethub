import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';
import { noticeShell } from './shell';
import { orderRef } from './format';

// 5b — the hold is about to lapse; nudge an unpaid buyer to check out.
export interface ExpiringDetails {
	to: string;
	ticketTitle: string;
	orderId: string;
}

export const holdExpiringEmail = (d: ExpiringDetails): MailMessage => {
	const ref = orderRef(d.orderId);

	const text = [
		`Your hold is about to expire.`,
		``,
		`Event: ${d.ticketTitle}`,
		`Order: No. ${ref}`,
		``,
		`Complete your payment now to keep your seat, or it will be released. — TicketHub`,
	].join('\n');

	return {
		to: d.to,
		subject: `Your hold is expiring soon — ${d.ticketTitle}`,
		html: noticeShell({
			accent: '#b8860b',
			eyebrow: 'Admit One · Hold Expiring',
			heading: escapeHtml(d.ticketTitle),
			body: `Your reservation (No. ${escapeHtml(ref)}) is about to expire. Complete payment now to keep your seat — otherwise it'll be released for other fans.`,
		}),
		text,
	};
};

// 5c — the hold lapsed without payment; the order was cancelled.
export interface CancelledDetails {
	to: string;
	ticketTitle: string;
	orderId: string;
}

export const orderCancelledEmail = (d: CancelledDetails): MailMessage => {
	const ref = orderRef(d.orderId);

	const text = [
		`Your hold expired.`,
		``,
		`Event: ${d.ticketTitle}`,
		`Order: No. ${ref}`,
		``,
		`The reservation was released because payment wasn't completed in time. The seat may still be available — search again on TicketHub.`,
	].join('\n');

	return {
		to: d.to,
		subject: `Your hold expired — ${d.ticketTitle}`,
		html: noticeShell({
			accent: '#c0392b',
			eyebrow: 'Admit One · Hold Released',
			heading: escapeHtml(d.ticketTitle),
			body: `Your reservation (No. ${escapeHtml(ref)}) was released because payment wasn't completed in time. The seat may still be available — search again on TicketHub to grab it.`,
		}),
		text,
	};
};
