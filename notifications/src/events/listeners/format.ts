// Small formatting helpers shared by the listeners that build user-facing copy
// and links.

// Base URL for links we put in emails. Falls back to the public host so a
// missing CLIENT_URL never ships a relative (broken) link.
export const clientUrl = () => process.env.CLIENT_URL || 'https://tickethub.com';

export const money = (n: number) =>
	new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n);
