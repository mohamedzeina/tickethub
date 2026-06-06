import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';

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

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

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
	          <div style="color:#b9791f;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Admit One · Price Drop</div>
	          <h1 style="margin:8px 0 0;color:#211b16;font-size:30px;line-height:1.05;">${escapeHtml(d.ticketTitle)}</h1>
	        </td></tr>
	        <tr><td style="padding:16px 32px;">
	          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
	                 style="font-family:'Courier New',monospace;font-size:13px;color:#5c5446;">
	            <tr><td style="padding:6px 0;">WAS</td><td align="right" style="text-decoration:line-through;">${money(d.oldPrice)}</td></tr>
	            <tr><td style="padding:6px 0;">NOW</td><td align="right" style="color:#b9791f;font-weight:bold;font-size:16px;">${money(d.newPrice)}</td></tr>
	            ${saved > 0 ? `<tr><td style="padding:6px 0;">YOU SAVE</td><td align="right">${money(saved)}</td></tr>` : ''}
	          </table>
	        </td></tr>
	        ${button}
	        <tr><td style="padding:18px 32px 28px;border-top:1px dashed #c9bfa6;">
	          <div style="color:#5c5446;font-size:13px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
	            A ticket on your wishlist just got cheaper. Prices can change again at any time. Thanks for using <b>TicketHub</b>.
	          </div>
	        </td></tr>
	      </table>
	    </td></tr>
	  </table>
	</div>`;

	return {
		to: d.to,
		subject: `Price drop — ${d.ticketTitle}`,
		html,
		text,
	};
};
