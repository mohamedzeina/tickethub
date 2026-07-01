import { MailMessage } from '../mailer';
import { escapeHtml } from './escape';

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

const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);

export const refundEmail = (d: RefundDetails): MailMessage => {
	const refunded = (d.refundedAt ?? new Date()).toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	const ref = d.orderId.slice(-6).toUpperCase();
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

	const seatsRow =
		d.price != null && qty > 1
			? `<tr><td style="padding:6px 0;">SEATS</td><td align="right">${qty} &times; ${money(d.price)}</td></tr>`
			: '';
	const amountRow =
		total != null
			? `<tr><td style="padding:6px 0;">AMOUNT</td><td align="right" style="color:#2e7d4f;font-weight:bold;">${money(total)}</td></tr>`
			: '';

	const html = `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
	    <tr><td align="center">
	      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	             style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	        <tr><td style="padding:28px 32px 8px;">
	          <div style="color:#2e7d4f;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Admit One · Refund Issued</div>
	          <h1 style="margin:8px 0 0;color:#211b16;font-size:30px;line-height:1.05;">${escapeHtml(d.ticketTitle)}</h1>
	        </td></tr>
	        <tr><td style="padding:16px 32px;">
	          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
	                 style="font-family:'Courier New',monospace;font-size:13px;color:#5c5446;">
	            ${seatsRow}
	            ${amountRow}
	            <tr><td style="padding:6px 0;">ORDER</td><td align="right">No. ${escapeHtml(ref)}</td></tr>
	            <tr><td style="padding:6px 0;">REFUNDED</td><td align="right">${refunded}</td></tr>
	            <tr><td style="padding:6px 0;">STRIPE REF</td><td align="right" style="font-size:11px;">${escapeHtml(d.stripeId)}</td></tr>
	          </table>
	        </td></tr>
	        <tr><td style="padding:18px 32px 28px;border-top:1px dashed #c9bfa6;">
	          <div style="color:#5c5446;font-size:13px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
	            We've refunded ${amountText} to your original payment method. It typically takes 5–10 business days to appear on your statement. Thanks for using <b>TicketHub</b>.
	          </div>
	        </td></tr>
	      </table>
	    </td></tr>
	  </table>
	</div>`;

	return {
		to: d.to,
		subject: `Your TicketHub refund — ${d.ticketTitle}`,
		html,
		text,
	};
};
