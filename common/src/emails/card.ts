import { escapeHtml } from './escape';

// The "Admit One" ticket-stub layout: an eyebrow + heading, a monospace table
// of label/value rows, an optional call-to-action, and a footer below a dashed
// tear line. Receipt, refund, price-drop and availability are all this card
// with different accents and rows.
//
// Plain inline styles only — email clients strip <style>/external CSS.
// Internal to this package: not re-exported from index.ts.

export interface CardRow {
	label: string;
	// Raw HTML: callers pre-format (money, dates) and are responsible for
	// escaping anything user-controlled that goes in here.
	value: string;
	// Optional inline style for the value cell (accent colour, size, strike).
	valueStyle?: string;
}

export interface CardOptions {
	accent: string;
	eyebrow: string;
	// Plain text — escaped here so no caller can forget.
	heading: string;
	rows: CardRow[];
	button?: { url: string; label: string };
	footer: string;
}

const renderRow = ({ label, value, valueStyle }: CardRow) =>
	`<tr><td style="padding:6px 0;">${label}</td><td align="right"${
		valueStyle ? ` style="${valueStyle}"` : ''
	}>${value}</td></tr>`;

const renderButton = (button?: { url: string; label: string }) =>
	button
		? `<tr><td style="padding:20px 32px 28px;">
		     <a href="${escapeHtml(button.url)}"
		        style="display:inline-block;background:#c0392b;color:#f3ecd8;text-decoration:none;
		               font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;
		               padding:12px 22px;border-radius:6px;">${button.label}</a>
		   </td></tr>`
		: '';

export const ticketCard = ({
	accent,
	eyebrow,
	heading,
	rows,
	button,
	footer,
}: CardOptions) => `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
	    <tr><td align="center">
	      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	             style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	        <tr><td style="padding:28px 32px 8px;">
	          <div style="color:${accent};font-size:13px;letter-spacing:.18em;text-transform:uppercase;">${eyebrow}</div>
	          <h1 style="margin:8px 0 0;color:#211b16;font-size:30px;line-height:1.05;">${escapeHtml(heading)}</h1>
	        </td></tr>
	        <tr><td style="padding:16px 32px;">
	          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
	                 style="font-family:'Courier New',monospace;font-size:13px;color:#5c5446;">
	            ${rows.map(renderRow).join('\n	            ')}
	          </table>
	        </td></tr>
	        ${renderButton(button)}
	        <tr><td style="padding:18px 32px 28px;border-top:1px dashed #c9bfa6;">
	          <div style="color:#5c5446;font-size:13px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
	            ${footer}
	          </div>
	        </td></tr>
	      </table>
	    </td></tr>
	  </table>
	</div>`;
