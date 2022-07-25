import { Logger } from '../utils/logger';
import winston from 'winston';

export class CookieService {
	private log: winston.Logger;

	constructor() {
		this.log = Logger.getServiceLogger('cookie');
	}

	eat(): void {
		this.log.info('Yum, this cookie is delicious');
	}
}
