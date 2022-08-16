import { GenericJSONValidator } from '@types';
import fs from 'fs-extra';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export async function loadConfig(schema: undefined): Promise<Record<string, any>>;
export async function loadConfig<T>(schema: GenericJSONValidator<T>): Promise<T>;
export async function loadConfig<T>(schema: GenericJSONValidator<T> | undefined): Promise<T | Record<string, any>> {
	const { config: filePath } = yargs(hideBin(process.argv))
		.options({
			config: {
				type: 'string',
				require: true,
				description: 'Path to config json file',
			},
		})
		.parseSync();

	if (schema) return await schema.validate(await fs.readJSON(filePath));
	return await fs.readJSON(filePath);
}

export async function loadSecret(schema: undefined): Promise<Record<string, any>>;
export async function loadSecret<T>(schema: GenericJSONValidator<T>): Promise<T>;
export async function loadSecret<T>(schema: GenericJSONValidator<T> | undefined): Promise<T | Record<string, any>> {
	const { secret: secretPath } = yargs(hideBin(process.argv))
		.options({
			secret: {
				type: 'string',
				require: true,
				description: 'Path to secret json file',
			},
		})
		.parseSync();

	if (schema) return await schema.validate(await fs.readJSON(secretPath));
	return await fs.readJSON(secretPath);
}

export function loadPk(): string {
	const { pk } = yargs(hideBin(process.argv))
		.options({
			pk: {
				type: 'string',
				require: true,
				description: 'The private key that will be used to sign transactions',
			},
		})
		.parseSync();

	return pk;
}

export function loadFlashbotPk(): string {
	const { bundlePk } = yargs(hideBin(process.argv))
		.options({
			bundlePk: {
				type: 'string',
				require: true,
				description: 'The private key that will be used to sign bundles',
			},
		})
		.parseSync();

	return bundlePk;
}
