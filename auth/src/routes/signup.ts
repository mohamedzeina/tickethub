import express from 'express';

const router = express.Router();

router.post('/api/users/signup', (req, res) => {
	res.send('Hi there, this is the sign up route');
});

export { router as signUpRouter };
