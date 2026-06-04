import mongoose from 'mongoose';
import { PasswordManager } from '../services/password';

// Interface that describes properties that are required to create a new User
interface UserAttrs {
	email: string;
	password: string;
	emailVerified?: boolean;
	displayName?: string;
}

// Interface that describes properties that the User model
interface UserModel extends mongoose.Model<UserDoc> {
	build(attrs: UserAttrs): UserDoc;
}

// Interface that describes the properties that a User document has
interface UserDoc extends mongoose.Document {
	email: string;
	password: string;
	emailVerified: boolean;
	// Public, user-editable display name (#18). Nullable — accounts that never
	// set one fall back to an opaque handle on the client. Never in the JWT
	// (it's mutable; would go stale until re-login).
	displayName?: string;
	// Account-hardening tokens (#7). We store only a sha256 *hash* of the raw
	// token (the raw value lives only in the email link) plus an expiry.
	verificationToken?: string;
	verificationTokenExpires?: Date;
	passwordResetToken?: string;
	passwordResetExpires?: Date;
}

// Interface for the JSON representation after transformation
interface UserJson {
	email: string;
	emailVerified?: boolean;
	displayName?: string | null;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	password?: string; // Optional for deletion
	__v?: number; // Optional for deletion
	id?: string; // Added during transformation
	verificationToken?: string | null;
	verificationTokenExpires?: Date | null;
	passwordResetToken?: string | null;
	passwordResetExpires?: Date | null;
}

const userSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
		},
		password: {
			type: String,
			required: true,
		},
		emailVerified: {
			type: Boolean,
			default: false,
		},
		displayName: String,
		verificationToken: String,
		verificationTokenExpires: Date,
		passwordResetToken: String,
		passwordResetExpires: Date,
	},
	{
		toJSON: {
			transform(doc: UserDoc, ret: UserJson) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.password;
				delete ret.__v;
				// Never leak token material or its expiry to clients.
				delete ret.verificationToken;
				delete ret.verificationTokenExpires;
				delete ret.passwordResetToken;
				delete ret.passwordResetExpires;
			},
		},
	},
);

userSchema.pre('save', async function (done) {
	if (this.isModified('password')) {
		const hashed = await PasswordManager.toHash(this.get('password'));
		this.set('password', hashed);
	}
	done();
});

userSchema.statics.build = (attrs: UserAttrs) => {
	return new User(attrs);
};

const User = mongoose.model<UserDoc, UserModel>('User', userSchema);

export { User, UserDoc };
