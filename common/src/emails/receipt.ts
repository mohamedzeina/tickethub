import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';

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

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

// "Admit One" styled purchase confirmation. Plain inline styles only — email
// clients strip <style>/external CSS, so everything is inlined.
export const purchaseReceiptEmail = (d: ReceiptDetails): MailMessage => {
	const paid = (d.paidAt ?? new Date()).toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	const ref = d.orderId.slice(-6).toUpperCase();
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

	const html = `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
	    <tr><td align="center">
	      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	             style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	        <tr><td style="padding:28px 32px 8px;">
	          <div style="color:#c0392b;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Admit One · Payment Confirmed</div>
	          <h1 style="margin:8px 0 0;color:#211b16;font-size:30px;line-height:1.05;">${escapeHtml(d.ticketTitle)}</h1>
	        </td></tr>
	        <tr><td style="padding:16px 32px;">
	          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
	                 style="font-family:'Courier New',monospace;font-size:13px;color:#5c5446;">
	            ${qty > 1 ? `<tr><td style="padding:6px 0;">SEATS</td><td align="right">${qty} &times; ${money(d.price)}</td></tr>` : ''}
		            <tr><td style="padding:6px 0;">AMOUNT</td><td align="right" style="color:#c0392b;font-weight:bold;">${money(total)}</td></tr>
	            <tr><td style="padding:6px 0;">ORDER</td><td align="right">No. ${escapeHtml(ref)}</td></tr>
	            <tr><td style="padding:6px 0;">PAID</td><td align="right">${paid}</td></tr>
	            <tr><td style="padding:6px 0;">STRIPE REF</td><td align="right" style="font-size:11px;">${escapeHtml(d.stripeId)}</td></tr>
	          </table>
	        </td></tr>
	        <tr><td style="padding:18px 32px 28px;border-top:1px dashed #c9bfa6;">
	          <div style="color:#5c5446;font-size:13px;font-family:Helvetica,Arial,sans-serif;">
	            Show this confirmation at the gate. Thanks for buying fan-to-fan on <b>TicketHub</b>.
	          </div>
	        </td></tr>
	      </table>
	    </td></tr>
	  </table>
	</div>`;

	return {
		to: d.to,
		subject: `Your TicketHub receipt — ${d.ticketTitle}`,
		html,
		text,
	};
};
