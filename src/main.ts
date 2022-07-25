import { CookieService } from './services/cookie.service';
import { Config, loadConfig } from './utils/config';
import { Logger } from './utils/logger';

export async function run(config: Config): Promise<void> {
	const log = Logger.getServiceLogger('main');
	const cookieService = new CookieService();

	log.debug('Starting to eat...');

	for (let index = 0; index < config.cookiesToEat; index++) {
		cookieService.eat();
	}

	log.debug('Finished eating');
}

if (!process.env.TEST_MODE) {
	(async () => {
		const config = await loadConfig();
		Logger.setLogConfig(config.log);
		run(config);
	})();
}
