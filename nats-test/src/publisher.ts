import nats from 'node-nats-streaming';

const stan: any = nats.connect('tickethub', 'abc', {
	url: 'http://localhost:4222',
});

stan.on('connect', () => {
	console.log('Publisher connected to NATS');
});
