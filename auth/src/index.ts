import express from 'express';
import { json } from 'body-parser';

const app = express();
app.use(json());

app.get('/api/users/currentuser', (_req, res) => {
	res.send('Current user route');
});

app.listen(3000, () => {
	console.log('Auth service is running on port 3000');
});
