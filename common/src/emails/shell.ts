import { escapeHtml } from './escape';

// The "Admit One" shell for prose notices — an eyebrow, a heading and a
// paragraph, with an optional call-to-action button plus a paste-able fallback
// link below it. Used by the verify/reset emails (with a CTA) and the hold
// expiry/cancellation emails (without one).
//
// Plain inline styles only — email clients strip <style>/external CSS.
// Internal to this package: not re-exported from index.ts.

export interface NoticeOptions {
	accent: string;
	eyebrow: string;
	// Pre-escaped HTML — headings here are sometimes user-controlled titles.
	heading: string;
	// Raw HTML: bodies carry <b> and pre-escaped interpolations.
	body: string;
	cta?: { label: string; url: string };
}

const renderCta = (accent: string, cta?: { label: string; url: string }) =>
	cta
		? `
	      <tr><td style="padding:20px 32px 8px;">
	        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${accent};color:#f3ecd8;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 26px;border-radius:6px;">${cta.label}</a>
	      </td></tr>
	      <tr><td style="padding:12px 32px 28px;">
	        <div style="color:#8a8071;font-size:12px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;word-break:break-all;">
	          Or paste this link into your browser:<br/>${escapeHtml(cta.url)}
	        </div>
	      </td></tr>`
		: '';

export const noticeShell = ({
	accent,
	eyebrow,
	heading,
	body,
	cta,
}: NoticeOptions) => `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
	    <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	           style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	      <tr><td style="padding:28px 32px 8px;">
	        <div style="color:${accent};font-size:13px;letter-spacing:.18em;text-transform:uppercase;">${eyebrow}</div>
	        <h1 style="margin:8px 0 0;color:#211b16;font-size:28px;line-height:1.05;">${heading}</h1>
	      </td></tr>
	      <tr><td style="padding:14px 32px ${cta ? '4px' : '28px'};">
	        <div style="color:#5c5446;font-size:14px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">${body}</div>
	      </td></tr>${renderCta(accent, cta)}
	    </table>
	  </td></tr></table>
	</div>`;
