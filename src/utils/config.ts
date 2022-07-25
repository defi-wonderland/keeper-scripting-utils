import fs from 'fs-extra';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as yup from 'yup';
import type { Asserts } from 'yup';

// log config definition
const logLevel = yup.string().oneOf(['debug', 'info', 'warn', 'error']).default('debug');
export const configLogSchema = yup.object({
	console: yup.object({
		level: logLevel,
	}),
	file: yup
		.object({
			level: logLevel,
			filename: yup.string().required(),
		})
		.notRequired()
		.default(undefined),
});

// config definition
export const configSchema = yup.object({
	cookiesToEat: yup.number().min(1).defined(),
	log: configLogSchema,
});

// transform schemas into interfaces
export type Config = Asserts<typeof configSchema>;
export type LogConfig = Asserts<typeof configLogSchema>;

/**
 * Requires to have config file path as a process argument,
 * it loads the config json from there and validates it against
 * the previously defined schema
 *
 * @returns validated config
 */
export async function loadConfig(): Promise<Config> {
	const { config: filePath } = yargs(hideBin(process.argv))
		.options({
			config: {
				type: 'string',
				require: true,
				description: 'Path to config json file',
			},
		})
		.parseSync();

	return await configSchema.validate(await fs.readJSON(filePath));
}
