import express from 'express';

const router = express.Router();

router.post('/api/users/signin', (req, res) => {
	res.send('Hi there, this is the sign in route');
});

export { router as signInRouter };
