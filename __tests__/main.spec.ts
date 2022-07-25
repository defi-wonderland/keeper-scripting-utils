import { run } from '../src/main';
import { CookieService } from '../src/services/cookie.service';
import { Logger } from '../src/utils/logger';
import { testConfig } from './common';
import { mocked } from 'ts-jest/utils';

const mockEat = jest.fn();
jest.mock('../src/services/cookie.service', () => ({
	CookieService: jest.fn().mockImplementation(() => ({
		eat: mockEat,
	})),
}));

describe('main', () => {
	const mockedCookieService = mocked(CookieService, true);

	beforeAll(() => {
		Logger.setLogConfig(testConfig.log);
	});

	beforeEach(() => {
		mockedCookieService.mockClear();
		mockEat.mockClear();
	});

	describe('run', () => {
		it('should instantiate the CookieService', async () => {
			await run(testConfig);
			expect(mockedCookieService).toHaveBeenCalledTimes(1);
		});

		it('should eat configured amount of times', async () => {
			await run(testConfig);
			expect(mockEat).toHaveBeenCalledTimes(testConfig.cookiesToEat);
		});
	});
});
