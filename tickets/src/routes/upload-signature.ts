import express, { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth } from '@zeina-tickethub/common';

const router = express.Router();

// Folder all ticket images are stored under in Cloudinary.
const UPLOAD_FOLDER = 'tickethub';

// Returns a short-lived signature the client uses to upload an image directly
// to Cloudinary. The API secret never leaves the server — only the signature,
// timestamp, and public identifiers are sent to the browser.
router.get(
	'/api/tickets/upload-signature',
	requireAuth,
	async (req: Request, res: Response) => {
		const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
		const apiKey = process.env.CLOUDINARY_API_KEY;
		const apiSecret = process.env.CLOUDINARY_API_SECRET;

		if (!cloudName || !apiKey || !apiSecret) {
			throw new Error('Cloudinary environment variables must be defined');
		}

		const timestamp = Math.round(Date.now() / 1000);

		// The signed params must exactly match what the client sends to Cloudinary.
		const signature = cloudinary.utils.api_sign_request(
			{ timestamp, folder: UPLOAD_FOLDER },
			apiSecret,
		);

		res.send({
			signature,
			timestamp,
			apiKey,
			cloudName,
			folder: UPLOAD_FOLDER,
		});
	},
);

export { router as uploadSignatureRouter };
