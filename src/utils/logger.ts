import { LogConfig } from './config';
import winston, { format } from 'winston';
import * as Transport from 'winston-transport';

const { combine, errors, timestamp, metadata, json } = format;
const loggerFormat = combine(errors({ stack: true }), timestamp(), metadata(), json());

export class Logger {
	private static logConfig: LogConfig | undefined;

	static setLogConfig(logConfig: LogConfig): void {
		Logger.logConfig = logConfig;
	}

	static getServiceLogger(service: string, meta: Record<string, unknown> = {}): winston.Logger {
		if (!Logger.logConfig) throw new Error('Log config is not defined');

		const transports: Transport[] = [
			new winston.transports.Console({
				level: Logger.logConfig.console.level,
			}),
		];

		if (Logger.logConfig.file) {
			transports.push(
				new winston.transports.File({
					level: Logger.logConfig.file.level,
					filename: Logger.logConfig.file.filename,
				})
			);
		}

		return winston.createLogger({
			format: loggerFormat,
			transports: transports,
			defaultMeta: { ...meta, service },
		});
	}
}
