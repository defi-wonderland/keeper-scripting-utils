import { config } from 'dotenv';

config();

export function getEnvVariable(name: string): string {
	const value: string | undefined = process.env[name];
	if (!value) throw new Error(`Environment variable ${name} not found`);
	return value;
}
