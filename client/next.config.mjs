// Make sure development server pulls changes every 300ms to reflect changes
// as we're running the app in a Docker container and
// file changes might not be detected immediately.

export default {
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
