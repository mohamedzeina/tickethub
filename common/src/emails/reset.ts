import { MailMessage } from '../mailer';
import { ctaShell } from './shell';

export interface PasswordResetDetails {
	to: string;
	resetUrl: string;
}

// Sent when a user requests a password reset. The link carries a short-lived
// token; auth verifies its hash before accepting a new password.
export const passwordResetEmail = (d: PasswordResetDetails): MailMessage => {
	const text = [
		`Reset your TicketHub password.`,
		``,
		`Use this link to choose a new password:`,
		d.resetUrl,
		``,
		`This link expires in 1 hour. If you didn't request a reset, you can`,
		`safely ignore this email — your password won't change.`,
	].join('\n');

	return {
		to: d.to,
		subject: `Reset your password — TicketHub`,
		html: ctaShell(
			'#c0392b',
			'Admit One · Password Reset',
			'Reset your password',
			`We got a request to reset your TicketHub password. Choose a new one with the button below. This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.`,
			'Reset password',
			d.resetUrl,
		),
		text,
	};
};
