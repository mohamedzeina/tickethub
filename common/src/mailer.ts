import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

// One shared SMTP transport, built lazily from env so the same code runs
// everywhere: Mailpit/MailHog locally (no auth) and a real relay (Brevo, Resend,
// SES, …) in prod — only the env vars change.
//
//   MAIL_HOST    smtp host           (unset → mail disabled, sends become no-ops)
//   MAIL_PORT    smtp port           (default 1025, Mailpit's)
//   MAIL_SECURE  'true' for TLS-on-connect (465); else STARTTLS/none
//   MAIL_USER    smtp username       (omit for Mailpit — no auth)
//   MAIL_PASS    smtp password
//   MAIL_FROM    default From header
let transporter: Transporter | null = null;
let resolved = false;

const getTransport = (): Transporter | null => {
	if (resolved) return transporter;
	resolved = true;

	const host = process.env.MAIL_HOST;
	if (!host) {
		// No mail configured (e.g. test runs) — sends become logged no-ops.
		return null;
	}

	transporter = nodemailer.createTransport({
		host,
		port: parseInt(process.env.MAIL_PORT || '1025', 10),
		secure: process.env.MAIL_SECURE === 'true',
		auth: process.env.MAIL_USER
			? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
			: undefined,
	});
	return transporter;
};

export interface MailMessage {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

// Best-effort send. Delivering an email must NEVER break the caller (recording a
// payment, cancelling an order, …), so a missing config or a transport error is
// logged and swallowed rather than thrown.
export const sendMail = async (msg: MailMessage): Promise<void> => {
	const transport = getTransport();
	if (!transport) {
		logger.info(
			{ to: msg.to, subject: msg.subject },
			'mail not configured; skipping send',
		);
		return;
	}

	try {
		const info = await transport.sendMail({
			from: process.env.MAIL_FROM || 'TicketHub <no-reply@tickethub.com>',
			to: msg.to,
			subject: msg.subject,
			html: msg.html,
			text: msg.text,
		});
		logger.info(
			{ to: msg.to, subject: msg.subject, messageId: info.messageId },
			'email sent',
		);
	} catch (err) {
		logger.error(
			{ err: (err as Error).message, to: msg.to, subject: msg.subject },
			'email send failed',
		);
	}
};
