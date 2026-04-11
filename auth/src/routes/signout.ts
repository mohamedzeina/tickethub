import express from 'express';

const router = express.Router();

router.post('/api/users/signout', (req, res) => {
	res.send('Hi there, this is the sign out route');
});

export { router as signOutRouter };
