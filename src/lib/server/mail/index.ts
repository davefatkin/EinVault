import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SMTP_CONFIG } from '$lib/server/env';

// Lazy singleton: the transporter holds a connection pool config but opens
// sockets only when a message is sent, so creating it at first use is cheap
// and keeps boot independent of SMTP reachability.
let transporter: Transporter | null = null;

export function isMailEnabled(): boolean {
	return SMTP_CONFIG !== null;
}

function getTransporter(): Transporter {
	if (!SMTP_CONFIG) throw new Error('SMTP is not configured');
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: SMTP_CONFIG.host,
			port: SMTP_CONFIG.port,
			secure: SMTP_CONFIG.secure,
			auth: SMTP_CONFIG.user ? { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass ?? '' } : undefined
		});
	}
	return transporter;
}

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
	if (!SMTP_CONFIG) throw new Error('SMTP is not configured');
	await getTransporter().sendMail({ from: SMTP_CONFIG.from, ...message });
}
