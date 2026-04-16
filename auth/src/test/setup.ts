import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';

declare global {
	var signin: () => Promise<string[]>;
}

let mongo: any;

beforeAll(async () => {
	process.env.JWT_KEY = '123456';

	mongo = await MongoMemoryServer.create();
	const mongoUri = mongo.getUri();

	await mongoose.connect(mongoUri, {});
});

beforeEach(async () => {
	if (mongoose.connection.db) {
		const collections = await mongoose.connection.db?.collections();

		for (let col of collections) {
			await col.deleteMany({});
		}
	}
});

afterAll(async () => {
	if (mongo) {
		await mongo.stop();
	}

	await mongoose.connection.close();
});

global.signin = async () => {
	const email = 'test@test.com';
	const password = '123456';

	const response = await request(app)
		.post('/api/users/signup')
		.send({
			email,
			password,
		})
		.expect(201);

	const cookie = response.get('Set-Cookie');

	if (!cookie) {
		throw new Error('Cookie is not defined');
	}

	return cookie;
};
