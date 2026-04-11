import express from 'express';

const router = express.Router();

router.get('/api/users/currentuser', (req, res) => {
	res.send('Hi there, this is the current user route');
});

export { router as currentUserRouter };
