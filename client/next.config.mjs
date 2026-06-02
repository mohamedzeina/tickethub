// Make sure development server pulls changes every 300ms to reflect changes
// as we're running the app in a Docker container and
// file changes might not be detected immediately.

export default {
	// Emit a self-contained server bundle so the prod image runs `node server.js`
	// (node as PID 1, minimal runtime deps).
	output: 'standalone',
	webpack: (config) => {
		return {
			...config,
			watchOptions: {
				...config.watchOptions,
				poll: 300,
			},
		};
	},
	allowedDevOrigins: ['tickethub.com'],
};
