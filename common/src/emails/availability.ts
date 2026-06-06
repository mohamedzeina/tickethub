import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';

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

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

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

	const button = url
		? `<tr><td style="padding:20px 32px 28px;">
		     <a href="${escapeHtml(url)}"
		        style="display:inline-block;background:#c0392b;color:#f3ecd8;text-decoration:none;
		               font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;
		               padding:12px 22px;border-radius:6px;">View the listing →</a>
		   </td></tr>`
		: '';

	const html = `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
	    <tr><td align="center">
	      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	             style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	        <tr><td style="padding:28px 32px 8px;">
	          <div style="color:#2e7d4f;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Admit One · Back On Sale</div>
	          <h1 style="margin:8px 0 0;color:#211b16;font-size:30px;line-height:1.05;">${escapeHtml(d.ticketTitle)}</h1>
	        </td></tr>
	        <tr><td style="padding:16px 32px;">
	          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
	                 style="font-family:'Courier New',monospace;font-size:13px;color:#5c5446;">
	            <tr><td style="padding:6px 0;">STATUS</td><td align="right" style="color:#2e7d4f;font-weight:bold;">Available again</td></tr>
	            <tr><td style="padding:6px 0;">PRICE</td><td align="right" style="font-size:16px;color:#211b16;">${money(d.price)}</td></tr>
	          </table>
	        </td></tr>
	        ${button}
	        <tr><td style="padding:18px 32px 28px;border-top:1px dashed #c9bfa6;">
	          <div style="color:#5c5446;font-size:13px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
	            A ticket on your wishlist is back on the board. Popular listings go fast, so don't wait too long. Thanks for using <b>TicketHub</b>.
	          </div>
	        </td></tr>
	      </table>
	    </td></tr>
	  </table>
	</div>`;

	return {
		to: d.to,
		subject: `Back on sale — ${d.ticketTitle}`,
		html,
		text,
	};
};
