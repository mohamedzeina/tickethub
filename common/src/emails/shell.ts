import { escapeHtml } from './escape';

// Shared "Admit One" email shell with a call-to-action button. Plain inline
// styles only — email clients strip <style>/external CSS.
export const ctaShell = (
	accent: string,
	eyebrow: string,
	heading: string,
	body: string,
	cta: string,
	url: string,
) => `
	<div style="background:#211b16;padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
	  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
	    <table role="presentation" width="480" cellpadding="0" cellspacing="0"
	           style="background:#f3ecd8;border-radius:10px;overflow:hidden;">
	      <tr><td style="padding:28px 32px 8px;">
	        <div style="color:${accent};font-size:13px;letter-spacing:.18em;text-transform:uppercase;">${eyebrow}</div>
	        <h1 style="margin:8px 0 0;color:#211b16;font-size:28px;line-height:1.05;">${heading}</h1>
	      </td></tr>
	      <tr><td style="padding:14px 32px 4px;">
	        <div style="color:#5c5446;font-size:14px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">${body}</div>
	      </td></tr>
	      <tr><td style="padding:20px 32px 8px;">
	        <a href="${url}" style="display:inline-block;background:${accent};color:#f3ecd8;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 26px;border-radius:6px;">${cta}</a>
	      </td></tr>
	      <tr><td style="padding:12px 32px 28px;">
	        <div style="color:#8a8071;font-size:12px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;word-break:break-all;">
	          Or paste this link into your browser:<br/>${escapeHtml(url)}
	        </div>
	      </td></tr>
	    </table>
	  </td></tr></table>
	</div>`;
