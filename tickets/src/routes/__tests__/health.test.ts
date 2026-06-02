import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { natsWrapper } from '../../nats-wrapper';

it('reports liveness on GET /healthz', async () => {
	const res = await request(app).get('/healthz').send().expect(200);
	expect(res.body.status).toEqual('ok');
});

it('reports ready on GET /readyz when mongo and nats are up', async () => {
	const res = await request(app).get('/readyz').send().expect(200);
	expect(res.body.status).toEqual('ready');
	expect(res.body.checks).toEqual({ mongo: true, nats: true });
});

it('reports not-ready on GET /readyz when nats is down', async () => {
	(natsWrapper as any).isConnected = false;

	const res = await request(app).get('/readyz').send().expect(503);
	expect(res.body.status).toEqual('not-ready');
	expect(res.body.checks.nats).toEqual(false);

	(natsWrapper as any).isConnected = true;
});

it('reports not-ready on GET /readyz when mongo is down', async () => {
	await mongoose.disconnect();

	const res = await request(app).get('/readyz').send().expect(503);
	expect(res.body.status).toEqual('not-ready');
	expect(res.body.checks.mongo).toEqual(false);
});
