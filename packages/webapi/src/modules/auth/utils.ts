/**
 * Converts seconds to milliseconds
 */
export const secondsToMilliseconds = (seconds: number) => seconds * 1000;
/**
 * Create an expire timestamp from now
 * @param seconds
 * @returns
 */
export const expireSecondsFromNow = (seconds: number) => Date.now() + secondsToMilliseconds(seconds);
