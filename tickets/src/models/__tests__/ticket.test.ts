import { Ticket } from '../ticket';

it('implements optimistic concurrency control', async () => {
	// Create an instance of a ticket
	const ticket = Ticket.build({
		title: 'Akon Concert',
		price: 50,
		userId: '123',
	});

	// Save the ticket to the database
	await ticket.save();

	// Fetch the ticket twice
	const firstInstance = await Ticket.findById(ticket.id);
	const secondInstance = await Ticket.findById(ticket.id);

	// Make two seperate changes to the tickets we fetched
	firstInstance!.set({ price: 10 });
	secondInstance!.set({ price: 15 });

	// Save the first fetched ticket
	await firstInstance!.save();

	// Save the second fetched ticket and expect an error
	try {
		await secondInstance!.save();
	} catch (err) {
		return;
	}

	throw new Error('Should not reach this point');
});

it('increments the version number on multiple saves', async () => {
	// Create an instance of a ticket
	const ticket = Ticket.build({
		title: 'Akon Concert',
		price: 50,
		userId: '123',
	});

	// Save the ticket to the database
	await ticket.save();

	// Expect the version of the ticket to be 0
	expect(ticket.version).toEqual(0);

	// Update the ticket and save it
	ticket.set({ price: 10 });
	await ticket.save();

	// Expect the version of the ticket to be 1
	expect(ticket.version).toEqual(1);

	// Update the ticket again and save it
	ticket.set({ price: 15 });
	await ticket.save();

	// Expect the version of the ticket to be 2
	expect(ticket.version).toEqual(2);
});
