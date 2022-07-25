import { Config, configSchema } from '../src/utils/config';

export const testConfig: Config = configSchema.validateSync({
	cookiesToEat: 2,
});
