// Escape user-controlled values before interpolating them into email HTML.
// Ticket titles are seller-controlled and flow into buyer emails, so an
// unescaped title is a stored-injection vector (phishing markup/links rendered
// in the recipient's inbox). Email clients strip <script>, but escaping all five
// HTML-significant characters closes off markup injection generally.
export const escapeHtml = (s: string): string =>
	String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
