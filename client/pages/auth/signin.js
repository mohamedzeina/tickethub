import AuthForm from '../../components/AuthForm';

const SignIn = () => (
	<AuthForm
		title="Welcome back"
		subtitle="Sign in to buy and manage your tickets."
		url="/api/users/signin"
		submitLabel="Sign In"
		forgotHref="/auth/forgot-password"
		footer={{
			text: "Don't have an account?",
			href: '/auth/signup',
			linkLabel: 'Sign up',
		}}
	/>
);

export default SignIn;
