import { LOG_PREFIX } from './constants';

/** Verbose logs only in development builds; warnings/errors always. */
const VERBOSE = process.env.NODE_ENV !== 'production';

export const log = {
    debug: (...args) => VERBOSE && console.log(LOG_PREFIX, ...args),
    info: (...args) => console.log(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args),
};
