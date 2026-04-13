import mongoose from 'mongoose';
import { Password } from '../services/password';

// Interface that describes properties that are required to create a new User
interface UserAttrs {
	email: string;
	password: string;
}

// Interface that describes properties that the User model
interface UserModel extends mongoose.Model<UserDoc> {
	build(attrs: UserAttrs): UserDoc;
}

// Interface that describes the properties that a User document has
interface UserDoc extends mongoose.Document {
	email: string;
	password: string;
}

// Interface for the JSON representation after transformation
interface UserJson {
	email: string;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	password?: string; // Optional for deletion
	__v?: number; // Optional for deletion
	id?: string; // Added during transformation
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
	},
	{
		toJSON: {
			transform(doc: UserDoc, ret: UserJson) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.password;
				delete ret.__v;
			},
		},
	},
);

userSchema.pre('save', async function (done) {
	if (this.isModified('password')) {
		const hashed = await Password.toHash(this.get('password'));
		this.set('password', hashed);
	}
	done();
});

userSchema.statics.build = (attrs: UserAttrs) => {
	return new User(attrs);
};

const User = mongoose.model<UserDoc, UserModel>('User', userSchema);

export { User };
