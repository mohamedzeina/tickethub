import { MailMessage } from '../mailer';
import { noticeShell } from './shell';

export interface VerifyEmailDetails {
	to: string;
	verifyUrl: string;
}

// Sent on signup (and resend). Confirms the buyer owns the email before they
// can transact.
export const verifyEmailEmail = (d: VerifyEmailDetails): MailMessage => {
	const text = [
		`Welcome to TicketHub — let's confirm your email.`,
		``,
		`Verify your address to start buying and selling tickets:`,
		d.verifyUrl,
		``,
		`If you didn't create a TicketHub account, you can ignore this email.`,
	].join('\n');

	return {
		to: d.to,
		subject: `Verify your email — TicketHub`,
		html: noticeShell({
			accent: '#1f7a4d',
			eyebrow: 'Admit One · Confirm Your Email',
			heading: 'Verify your email',
			body: `Welcome to TicketHub. Confirm this is your email address to start buying and selling tickets. This link expires in 24 hours.`,
			cta: { label: 'Verify email', url: d.verifyUrl },
		}),
		text,
	};
};
