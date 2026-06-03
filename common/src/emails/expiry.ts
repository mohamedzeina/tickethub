import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';

const ref = (orderId: string) => orderId.slice(-6).toUpperCase();

const shell = (accent: string, eyebrow: string, heading: string, body: string) => `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
	    <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	           style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	      <tr><td style="padding:28px 32px 8px;">
	        <div style="color:${accent};font-size:13px;letter-spacing:.18em;text-transform:uppercase;">${eyebrow}</div>
	        <h1 style="margin:8px 0 0;color:#211b16;font-size:28px;line-height:1.05;">${heading}</h1>
	      </td></tr>
	      <tr><td style="padding:14px 32px 28px;">
	        <div style="color:#5c5446;font-size:14px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">${body}</div>
	      </td></tr>
	    </table>
	  </td></tr></table>
	</div>`;

// 5b — the hold is about to lapse; nudge an unpaid buyer to check out.
export interface ExpiringDetails {
	to: string;
	ticketTitle: string;
	orderId: string;
}

export const holdExpiringEmail = (d: ExpiringDetails): MailMessage => {
	const text = [
		`Your hold is about to expire.`,
		``,
		`Event: ${d.ticketTitle}`,
		`Order: No. ${ref(d.orderId)}`,
		``,
		`Complete your payment now to keep your seat, or it will be released. — TicketHub`,
	].join('\n');

	return {
		to: d.to,
		subject: `Your hold is expiring soon — ${d.ticketTitle}`,
		html: shell(
			'#b8860b',
			'Admit One · Hold Expiring',
			escapeHtml(d.ticketTitle),
			`Your reservation (No. ${escapeHtml(ref(d.orderId))}) is about to expire. Complete payment now to keep your seat — otherwise it'll be released for other fans.`,
		),
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
	const text = [
		`Your hold expired.`,
		``,
		`Event: ${d.ticketTitle}`,
		`Order: No. ${ref(d.orderId)}`,
		``,
		`The reservation was released because payment wasn't completed in time. The seat may still be available — search again on TicketHub.`,
	].join('\n');

	return {
		to: d.to,
		subject: `Your hold expired — ${d.ticketTitle}`,
		html: shell(
			'#c0392b',
			'Admit One · Hold Released',
			escapeHtml(d.ticketTitle),
			`Your reservation (No. ${escapeHtml(ref(d.orderId))}) was released because payment wasn't completed in time. The seat may still be available — search again on TicketHub to grab it.`,
		),
		text,
	};
};
